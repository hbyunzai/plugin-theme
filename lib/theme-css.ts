import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import less from 'less';
const lessToJs = require('less-vars-to-js');
const LessPluginCleanCSS = require('less-plugin-clean-css');

import { ThemeCssItem, BuildThemeCSSOptions, ThemeCssConfig } from './theme-css.types';
import { d, deepMergeKey } from './utils';

const root = process.cwd();
let node_modulesPath = '';

function fixConfig(config: ThemeCssConfig): ThemeCssConfig {
  config = deepMergeKey(
    {
      additionalLibraries: [],
      additionalThemeVars: [],
      list: [],
      min: true,
      projectStylePath: 'src/styles.less',
    } as ThemeCssConfig,
    true,
    config,
  );

  const list: ThemeCssItem[] = [];
  config.list!.forEach(item => {
    if (!item.theme && !item.modifyVars) {
      return;
    }
    if (!item.key) {
      item.key = item.theme || 'invalid-key';
    }
    if (!item.filePath) {
      item.filePath = `src/assets/style.${item.key || 'invalid-name'}.css`;
    }
    list.push({ projectThemeVar: [], ...item });
  });

  if (list.length === 0) {
    throw new Error(`Not found valid theme configuration`);
  }

  config.list = list;

  return config;
}

function genThemeVars(type: 'default' | 'dark' | 'compact', extraThemeVars: string[]): { [key: string]: string } {
  const contents: string[] = [];
  // ng-zorro-antd
  const ngZorroAntdStylePath = join(root, node_modulesPath, 'ng-zorro-antd', 'style');
  if (existsSync(ngZorroAntdStylePath)) {
    contents.push(readFileSync(join(ngZorroAntdStylePath, 'color', 'colors.less'), 'utf-8'));
    contents.push(readFileSync(join(ngZorroAntdStylePath, 'themes', `${type}.less`), 'utf-8'));
  }
  // @yelon
  const yelonPath = join(root, node_modulesPath, '@yelon');
  // @yelon/theme/system
  const yelonSystem = join(yelonPath, 'theme');
  if (existsSync(yelonSystem)) {
    [
      join(yelonSystem, 'system', `theme-${type}.less`),
      join(yelonSystem, 'layout-default', 'style', `theme-${type}.less`),
      join(yelonSystem, 'layout-blank', 'style', `theme-${type}.less`),
    ].forEach(filePath => {
      if (!existsSync(filePath)) {
        console.warn(`主题路径 ${filePath} 不存在`);
        return;
      }
      contents.push(readFileSync(filePath, 'utf-8'));
    });
  }
  ['abc', 'chart', 'bis', 'bcs'].forEach(libName => {
    const libThemePath = join(yelonPath, libName, `theme-${type}.less`);
    if (existsSync(libThemePath)) {
      contents.push(readFileSync(libThemePath, 'utf-8'));
    }
  });

  // 外部样式 extraThemeVars
  if (Array.isArray(extraThemeVars) && extraThemeVars.length > 0) {
    contents.push(
      ...extraThemeVars.map(path => {
        // 自动处理 src/app/layout/name/styles/theme-#NAME#.less之类的
        const lessFilePath = join(root, path.replace(`#NAME#`, type));
        if (!existsSync(lessFilePath)) {
          return '';
        }
        return readFileSync(lessFilePath, 'utf-8');
      }),
    );
  }

  return lessToJs(contents.join(''), {
    stripPrefix: true,
    resolveVariables: false,
  });
}

function genVar(config: ThemeCssConfig, item: ThemeCssItem): { [key: string]: string } {
  // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
  const fileContent = item.projectThemeVar?.map(path => readFileSync(join(root, path), 'utf-8'))!;
  // add project theme
  fileContent.push(readFileSync(join(root, config.projectStylePath!), 'utf-8'));
  let projectTheme: { [key: string]: string } = {};
  if (fileContent) {
    projectTheme = lessToJs(fileContent.join(''), {
      stripPrefix: true,
      resolveVariables: false,
    });
  }
  const modifyVars = item.modifyVars || {};
  const stripPrefixOfModifyVars: { [key: string]: string } = {};
  Object.keys(modifyVars).forEach(key => {
    const newKey = key.startsWith('@') ? key.substr(1) : key;
    stripPrefixOfModifyVars[newKey] = modifyVars[key];
  });
  const additionalThemeVars = config.additionalThemeVars!;
  return {
    ...genThemeVars('default', additionalThemeVars),
    ...(item.theme === 'dark' ? genThemeVars('dark', additionalThemeVars) : null),
    ...(item.theme === 'compact' ? genThemeVars('compact', additionalThemeVars) : null),
    ...projectTheme,
    ...stripPrefixOfModifyVars,
  };
}

async function buildCss(options: BuildThemeCSSOptions, config: ThemeCssConfig): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins: any[] = [];
  if (options.min === true) {
    plugins.push(new LessPluginCleanCSS({ advanced: true }));
  }
  return less
    .render(options.content, {
      javascriptEnabled: true,
      plugins,
      paths: ['node_modules/'],
      ...config.buildLessOptions,
      modifyVars: {
        ...options.modifyVars,
      },
    })
    .then(res => res.css);
}

export async function buildThemeCSS(config: ThemeCssConfig): Promise<void> {
  node_modulesPath = config.nodeModulesPath || 'node_modules';
  config = fixConfig(config);

  const promises = config.list?.map(item => {
    const modifyVars = genVar(config, item);
    d(config, 'All Modify Vars', modifyVars);
    const content = [
      // 如果项目入口样子已经包含 【@import '~@yelon/theme/system/index';】 所以则无须增加
      // 否则部分 javascript less 变量会无法找到，例如：
      // message:'error evaluating function `color`: JavaScript evaluation error: 'ReferenceError: colorPalette is not defined''
      // `@import '${join(node_modulesPath + 'ng-zorro-antd/style/color/colors.less')}'`,
      `@import '${config.projectStylePath}';`,
      ...config.additionalLibraries!.map(v => `@import '${v}';`),
    ].join('');
    const options: BuildThemeCSSOptions = {
      min: config.min,
      content,
      modifyVars,
    };
    if (existsSync(item.filePath!)) {
      unlinkSync(item.filePath!);
    }
    return buildCss(options, config).then(css => {
      writeFileSync(item.filePath!, css);
      console.log(`✅ Style '${item.key}' generated successfully. Output: ${item.filePath!}`);
    });
  });

  await Promise.all(promises!);
}
