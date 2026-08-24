import xss, { whiteList } from "xss";
import type { IFilterXSSOptions } from "xss";

const options: IFilterXSSOptions = {
  whiteList: {
    ...whiteList,
    p: ["class"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    span: ["style", "class"],
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    iframe: [],
    script: [],
    video: ["src", "controls", "width", "height"],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe"],
  css: false,
};

export function sanitizeHtml(html: string) {
  return xss(html || "", options).trim();
}
