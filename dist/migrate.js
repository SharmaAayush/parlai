"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/server/db/data-source.ts
var import_reflect_metadata = require("reflect-metadata");
var import_pg = __toESM(require("pg"));
var import_typeorm = require("typeorm");
var import_typeorm_naming_strategies = require("typeorm-naming-strategies");

// src/server/db/entities/index.ts
var entities = [];

// src/server/db/migrations/index.ts
var migrations = [];

// src/server/db/data-source.ts
function createDataSource(url) {
  return new import_typeorm.DataSource({
    type: "postgres",
    url: url ?? process.env.DATABASE_URL,
    driver: import_pg.default,
    // static import so Docker's file tracing includes `pg`
    namingStrategy: new import_typeorm_naming_strategies.SnakeNamingStrategy(),
    entities,
    migrations,
    synchronize: false,
    // NEVER true
    logging: ["error", "warn"]
  });
}
var data_source_default = createDataSource();

// scripts/migrate.ts
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const revert = process.argv.includes("--revert");
  const ds = await data_source_default.initialize();
  try {
    if (revert) {
      await ds.undoLastMigration({ transaction: "each" });
      console.log("Reverted last migration");
    } else {
      const done = await ds.runMigrations({ transaction: "each" });
      console.log(
        done.length ? `Applied: ${done.map((m) => m.name).join(", ")}` : "No pending migrations"
      );
    }
  } finally {
    await ds.destroy();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
