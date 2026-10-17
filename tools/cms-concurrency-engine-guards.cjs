/**
 * Engine-aware guard loader for CMS Concurrency Phase 1 disposable integration.
 * CONCURRENCY-20: selects MySQL 8.0.46 or MariaDB 11.8.9 contract via CMS_CONCURRENCY_ENGINE.
 * Never connects to a database. Never loads production .env.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS guard module */
const path = require("path");

function resolveEngine(env) {
  const raw = String((env && env.CMS_CONCURRENCY_ENGINE) || "mysql").trim().toLowerCase();
  if (raw === "mariadb") return "mariadb";
  if (raw === "mysql" || raw === "") return "mysql";
  return null;
}

function loadGuards(env) {
  const engine = resolveEngine(env || process.env);
  if (!engine) {
    throw new Error("CMS_CONCURRENCY_ENGINE must be mysql or mariadb");
  }
  if (engine === "mariadb") {
    return {
      engine,
      ...require(path.join(__dirname, "cms-concurrency-mariadb-disposable-guards.cjs")),
    };
  }
  return {
    engine,
    ...require(path.join(__dirname, "cms-concurrency-mysql-disposable-guards.cjs")),
  };
}

module.exports = {
  resolveEngine,
  loadGuards,
};
