import { Config } from './types';

export interface ThemeCssConfig extends Config {
  /** Specify the node_modules directory, default: `node_modules` */
  nodeModulesPath?: string;
  /** Project entry style file path, default: `src/styles.less` */
  projectStylePath?: string;
  /** Additional library style entries */
  additionalLibraries?: string[];
  /** Additional theme variables entries */
  additionalThemeVars?: string[];
  /** Whether to compress, default: `true` */
  min?: boolean;
  /** Theme list */
  list?: ThemeCssItem[];
}

export interface ThemeCssItem {
  /**
   * Unique identifier
   */
  key?: string;
  /**
   * Save path after generation, default: `src/assets/style.{key}.css`
   */
  filePath?: string;
  /**
   * Theme type, can be set `dark` and `compact`, must choose between `theme` and `modifyVars`
   */
  theme?: 'dark' | 'compact';
  /**
   * Project theme less variables, except for `ng-zorro-antd`, `@yelon/*`, and the specified `projectStylePath` file
   */
  projectThemeVar?: string[];
  /**
   * Custom Less variables, must choose between `theme` and `modifyVars`
   */
  modifyVars?: { [key: string]: string };
}

export interface BuildThemeCSSOptions {
  content: string;
  /** 是否压缩，默认：`true` */
  min?: boolean;
  modifyVars?: { [key: string]: string };
}
