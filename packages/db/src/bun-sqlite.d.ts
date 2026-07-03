// Minimal ambient typings for the subset of `bun:sqlite` used by the canonical DB module.
// The repo runs on Bun (see package.json `packageManager`); these declarations let `tsc` resolve
// the `bun:sqlite` import without depending on the full `bun-types` package. This file is pulled
// into both the harness and CLI compilations via the triple-slash reference in canonical-db.ts
// (the CLI typechecks the harness package transitively through its index export).
declare module "bun:sqlite" {
  export interface Statement {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
    finalize(): void;
  }

  export interface DatabaseOptions {
    readonly?: boolean;
    create?: boolean;
    readwrite?: boolean;
    strict?: boolean;
    safeIntegers?: boolean;
  }

  export class Database {
    constructor(filename?: string, options?: DatabaseOptions);
    query(sql: string): Statement;
    prepare(sql: string): Statement;
    exec(sql: string, ...params: unknown[]): void;
    run(sql: string, ...params: unknown[]): unknown;
    close(throwOnError?: boolean): void;
  }

  export default Database;
}
