import type { CatalogRepository } from "@/lib/cms/catalog";
import type { CmsRepository } from "@/lib/cms/json-repository";
import { LocalJsonRepository } from "@/lib/cms/json-repository";
import { JsonCatalogRepository } from "@/lib/cms/json-catalog";
import { MysqlCatalogRepository } from "@/lib/cms/mysql-catalog";
import { MysqlCmsRepository, MysqlWithBuildFallback } from "@/lib/cms/mysql-repository";
import { isDatabaseConfigured, isProductionRuntime } from "@/lib/db/config";

export type { CmsRepository } from "@/lib/cms/json-repository";
export { LocalJsonRepository } from "@/lib/cms/json-repository";

export type Cms = CmsRepository & CatalogRepository;

function mergeCms(pages: CmsRepository, catalog: CatalogRepository): Cms {
  return new Proxy({} as Cms, {
    get(_, prop) {
      const source = prop in pages ? pages : catalog;
      const value = Reflect.get(source as object, prop);
      return typeof value === "function" ? value.bind(source) : value;
    },
  });
}

const jsonCms = new LocalJsonRepository();
const jsonCatalog = new JsonCatalogRepository();
const useMysql = isDatabaseConfigured();

if (process.env.NEXT_PHASE !== "phase-production-build") {
  const adapter = useMysql ? "mysql" : isProductionRuntime() ? "json-read-only-failclosed-writes" : "json";
  console.info(`[cms] persistence adapter: ${adapter}`);
}

function createMysqlCms(): Cms {
  const mysqlPages = new MysqlCmsRepository();
  const mysqlCatalog = new MysqlCatalogRepository(() => mysqlPages.ready());
  return mergeCms(new MysqlWithBuildFallback(mysqlPages, jsonCms), mysqlCatalog);
}

// Production runtime without MySQL still constructs the JSON adapter for reads, but
// LocalJsonRepository / json-store refuse mutations (fail closed). Local/dev keeps JSON writes.
export const cms: Cms = useMysql ? createMysqlCms() : mergeCms(jsonCms, jsonCatalog);
