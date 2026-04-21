/**
 * Patch Parser — Changed Column Detection
 *
 * Parses unified diff patches from PR file changes to detect
 * likely changed columns in SQL models and YAML schema files.
 *
 * This is heuristic-based and deterministic — no LLM dependency.
 * When detection is uncertain, it returns an explicit confidence marker.
 */

/**
 * A column change detected from a PR patch.
 */
export interface ChangedColumn {
  /** Column name */
  name: string;
  /** Type of change */
  changeType: 'added' | 'removed' | 'modified' | 'renamed';
  /** Confidence of the detection */
  confidence: 'high' | 'medium' | 'low';
  /** Source of detection */
  source: 'sql-select' | 'sql-alter' | 'yaml-schema' | 'yaml-column' | 'heuristic';
}

/**
 * Result of patch analysis for a single file.
 */
export interface PatchAnalysis {
  /** File path */
  filePath: string;
  /** Detected changed columns */
  changedColumns: ChangedColumn[];
  /** Whether the change appears structural (schema-altering) vs cosmetic */
  isStructuralChange: boolean;
  /** Summary of what kind of changes were detected */
  changeDescription: string;
}

/**
 * Parse a unified diff patch and detect changed columns.
 */
export function parsePatch(filePath: string, patch: string | undefined): PatchAnalysis {
  if (!patch) {
    return {
      filePath,
      changedColumns: [],
      isStructuralChange: false,
      changeDescription: 'No patch data available',
    };
  }

  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  if (ext === 'sql') {
    return parseSqlPatch(filePath, patch);
  } else if (ext === 'yml' || ext === 'yaml') {
    return parseYamlPatch(filePath, patch);
  }

  return {
    filePath,
    changedColumns: [],
    isStructuralChange: false,
    changeDescription: `Unsupported file type: .${ext}`,
  };
}

/**
 * Parse SQL model patches for column changes.
 * Detects: SELECT column lists, ALTER TABLE, column aliases, CTE definitions.
 */
function parseSqlPatch(filePath: string, patch: string): PatchAnalysis {
  const columns: ChangedColumn[] = [];
  const addedLines: string[] = [];
  const removedLines: string[] = [];

  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push(line.slice(1).trim());
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removedLines.push(line.slice(1).trim());
    }
  }

  // Pattern: SQL column references in SELECT clauses
  //   col_name,   col_name AS alias,   table.col_name
  const sqlColumnPattern = /\b(\w+)\s+(?:as\s+)?(\w+)?/gi;
  // Pattern: ALTER TABLE ADD/DROP/RENAME COLUMN
  const alterPattern = /(?:add|drop|rename|modify|alter)\s+(?:column\s+)?(\w+)/gi;

  // Extract columns from removed lines (these are columns being changed/removed)
  for (const line of removedLines) {
    // Skip comments and non-column lines
    if (line.startsWith('--') || line.startsWith('/*') || !line.trim()) continue;

    // Check for ALTER TABLE patterns
    let match: RegExpExecArray | null;
    const alterCheck = new RegExp(alterPattern.source, 'gi');
    while ((match = alterCheck.exec(line)) !== null) {
      columns.push({
        name: match[1],
        changeType: 'removed',
        confidence: 'high',
        source: 'sql-alter',
      });
    }

    // Check for column references in SELECT-like contexts
    const selectCols = extractSqlColumns(line);
    for (const col of selectCols) {
      if (!columns.some(c => c.name === col)) {
        columns.push({
          name: col,
          changeType: 'removed',
          confidence: 'medium',
          source: 'sql-select',
        });
      }
    }
  }

  // Extract columns from added lines
  for (const line of addedLines) {
    if (line.startsWith('--') || line.startsWith('/*') || !line.trim()) continue;

    const alterCheck = new RegExp(alterPattern.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = alterCheck.exec(line)) !== null) {
      // Check if this column was also removed (= modified)
      const existing = columns.find(c => c.name === match![1]);
      if (existing) {
        existing.changeType = 'modified';
      } else {
        columns.push({
          name: match[1],
          changeType: 'added',
          confidence: 'high',
          source: 'sql-alter',
        });
      }
    }

    const selectCols = extractSqlColumns(line);
    for (const col of selectCols) {
      const existing = columns.find(c => c.name === col);
      if (existing) {
        existing.changeType = 'modified';
      } else if (!columns.some(c => c.name === col)) {
        columns.push({
          name: col,
          changeType: 'added',
          confidence: 'medium',
          source: 'sql-select',
        });
      }
    }
  }

  // Detect renames: removed column + added column in same position
  const removedOnly = columns.filter(c => c.changeType === 'removed');
  const addedOnly = columns.filter(c => c.changeType === 'added');
  if (removedOnly.length === 1 && addedOnly.length === 1) {
    removedOnly[0].changeType = 'renamed';
    addedOnly[0].changeType = 'renamed';
    removedOnly[0].confidence = 'medium';
    addedOnly[0].confidence = 'medium';
  }

  const isStructural = columns.length > 0 ||
    removedLines.some(l => /\b(drop|alter|rename|add\s+column)\b/i.test(l)) ||
    addedLines.some(l => /\b(drop|alter|rename|add\s+column)\b/i.test(l));

  return {
    filePath,
    changedColumns: deduplicateColumns(columns),
    isStructuralChange: isStructural,
    changeDescription: columns.length > 0
      ? `${columns.length} column(s) potentially affected`
      : isStructural ? 'Structural SQL change detected' : 'Non-structural SQL change',
  };
}

/**
 * Parse YAML schema patches for column changes.
 * Detects: dbt schema.yml column definitions, description changes, test changes.
 */
function parseYamlPatch(filePath: string, patch: string): PatchAnalysis {
  const columns: ChangedColumn[] = [];
  const lines = patch.split('\n');

  let inColumnsBlock = false;
  let currentColumn: string | null = null;
  let lineIsAdded = false;
  let lineIsRemoved = false;

  for (const rawLine of lines) {
    lineIsAdded = rawLine.startsWith('+') && !rawLine.startsWith('+++');
    lineIsRemoved = rawLine.startsWith('-') && !rawLine.startsWith('---');

    const line = rawLine.replace(/^[+-]/, '').trim();

    // Detect start of columns block
    if (/^columns:/.test(line)) {
      inColumnsBlock = true;
      continue;
    }

    // Detect column name definition
    const colNameMatch = line.match(/^-\s+name:\s*(\S+)/);
    if (colNameMatch && inColumnsBlock) {
      currentColumn = colNameMatch[1];
      if (lineIsAdded || lineIsRemoved) {
        columns.push({
          name: currentColumn,
          changeType: lineIsAdded ? 'added' : 'removed',
          confidence: 'high',
          source: 'yaml-column',
        });
      }
      continue;
    }

    // Detect changes within a column definition
    if (currentColumn && inColumnsBlock && (lineIsAdded || lineIsRemoved)) {
      const descMatch = line.match(/^description:|^data_type:|^tests:/);
      if (descMatch && !columns.some(c => c.name === currentColumn)) {
        columns.push({
          name: currentColumn,
          changeType: 'modified',
          confidence: 'high',
          source: 'yaml-column',
        });
      }
    }

    // Exit columns block on de-indent
    if (inColumnsBlock && !rawLine.startsWith('+') && !rawLine.startsWith('-') &&
        /^\S/.test(line) && !/^columns:/.test(line) && line.length > 0) {
      inColumnsBlock = false;
      currentColumn = null;
    }
  }

  return {
    filePath,
    changedColumns: deduplicateColumns(columns),
    isStructuralChange: columns.length > 0,
    changeDescription: columns.length > 0
      ? `${columns.length} column(s) changed in schema definition`
      : 'Schema file changed (no column-level changes detected)',
  };
}

/**
 * Extract likely column names from a SQL line.
 * Handles: bare identifiers, qualified names (table.col), aliases (col AS alias).
 */
function extractSqlColumns(line: string): string[] {
  const cols: string[] = [];

  // Skip non-column lines
  if (/^\s*(from|join|where|group|order|having|limit|union|with|create|insert|update|delete|set|into|values)\b/i.test(line)) {
    return cols;
  }

  // Match column-like patterns:
  //   word,   word AS alias,   table.word,   word::type
  const patterns = [
    /(?:^|,)\s*(?:\w+\.)?(\w+)\s*(?:as\s+\w+)?\s*(?:,|$)/gi,  // col or table.col [AS alias],
    /(?:^|,)\s*(?:\w+\.)?(\w+)::\w+/gi, // col::type (Postgres cast)
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    const p = new RegExp(pattern.source, pattern.flags);
    while ((match = p.exec(line)) !== null) {
      const name = match[1];
      // Filter SQL keywords and common noise
      if (name && !isSqlKeyword(name) && name.length > 1) {
        cols.push(name);
      }
    }
  }

  return [...new Set(cols)];
}

const SQL_KEYWORDS = new Set([
  'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'null',
  'as', 'on', 'join', 'left', 'right', 'inner', 'outer', 'cross', 'full',
  'group', 'order', 'by', 'having', 'limit', 'offset', 'union', 'all',
  'case', 'when', 'then', 'else', 'end', 'cast', 'between', 'like',
  'true', 'false', 'asc', 'desc', 'distinct', 'exists', 'with', 'recursive',
  'create', 'table', 'view', 'drop', 'alter', 'insert', 'update', 'delete',
  'into', 'values', 'set', 'index', 'primary', 'key', 'foreign', 'references',
  'constraint', 'default', 'check', 'unique', 'column', 'if', 'replace',
  'int', 'integer', 'bigint', 'varchar', 'text', 'boolean', 'decimal',
  'float', 'double', 'date', 'timestamp', 'timestamptz', 'interval',
  'count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif',
]);

function isSqlKeyword(word: string): boolean {
  return SQL_KEYWORDS.has(word.toLowerCase());
}

function deduplicateColumns(columns: ChangedColumn[]): ChangedColumn[] {
  const seen = new Map<string, ChangedColumn>();
  for (const col of columns) {
    const existing = seen.get(col.name);
    if (!existing || col.confidence === 'high') {
      seen.set(col.name, col);
    }
  }
  return [...seen.values()];
}
