import { Pool } from "pg";

const globalForDatabase = globalThis as typeof globalThis & {
  wisdomLoongPool?: Pool;
  wisdomLoongPoolErrorHandler?: boolean;
};

export const database =
  globalForDatabase.wisdomLoongPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    database: process.env.PGDATABASE ?? "wisdomloong",
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 10,
  });

if (!globalForDatabase.wisdomLoongPoolErrorHandler) {
  database.on("error", (error) => {
    console.error("Unexpected idle database connection error", error);
  });
  globalForDatabase.wisdomLoongPoolErrorHandler = true;
}

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.wisdomLoongPool = database;
}
