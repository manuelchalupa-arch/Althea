import type { HTMLAttributes, TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes, ReactNode } from 'react';

interface AltheaColumn<T> {
  key: string;
  header: string;
  headerProps?: ThHTMLAttributes<HTMLTableCellElement>;
  cell?: (row: T) => ReactNode;
  cellProps?: (row: T) => TdHTMLAttributes<HTMLTableCellElement>;
}

interface AltheaTableProps<T> extends TableHTMLAttributes<HTMLTableElement> {
  columns: AltheaColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  striped?: boolean;
  onRowClick?: (row: T) => void;
}

export function AltheaTable<T>({ columns, data, rowKey, empty, striped = true, onRowClick, className = '', ...props }: AltheaTableProps<T>) {
  if (data.length === 0) {
    return empty ? <>{empty}</> : null
  }
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-outline-variant bg-surface shadow-al-sm">
      <table className={`althea-table ${striped ? 'althea-table--striped' : ''} ${className}`} {...props}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} {...col.headerProps}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  {...(col.cellProps ? col.cellProps(row) : undefined)}
                >
                  {col.cell ? col.cell(row) : (row as Record<string, ReactNode>)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface AltheaTableContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function AltheaTableContainer({ children, className = '', ...props }: AltheaTableContainerProps) {
  return (
    <div className={`w-full overflow-x-auto rounded-lg border border-outline-variant bg-surface shadow-al-sm ${className}`} {...props}>
      {children}
    </div>
  );
}