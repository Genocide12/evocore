declare module "react-syntax-highlighter" {
  import type { ComponentType } from "react";
  export const Prism: ComponentType<Record<string, unknown>>;
  export const Light: ComponentType<Record<string, unknown>>;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism" {
  export const oneDark: Record<string, Record<string, string>>;
  export const vscDarkPlus: Record<string, Record<string, string>>;
}
