import { join } from 'path';
import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'fs';
import less from 'less';
const LessPluginCleanCSS = require('less-plugin-clean-css');

import { ThemeCssItem, BuildThemeCSSOptions, ThemeCssConfig } from './theme-css.types';
import { deepMergeKey, getJSON, mergePath } from './utils';


const root = process.cwd();
let node_modulesPath = '';

function fixConfig(config: ThemeCssConfig): ThemeCssConfig {
  let styleSourceRoot = 'src';
  if (config.name) {
    const angularJsonPath = join(root, 'angular.json');
    const sourceRoot = getJSON(angularJsonPath)?.projects[config.name!].sourceRoot;
    if (sourceRoot != null) {
      styleSourceRoot = sourceRoot;
    }
  }
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

function genStripVar(item: ThemeCssItem): { [key: string]: string } {
  const modifyVars = item.modifyVars || {};
  const stripPrefixOfModifyVars: { [key: string]: string } = {};
  Object.keys(modifyVars).forEach(key => {
    const newKey = key.startsWith('@') ? key.substring(1) : key;
    stripPrefixOfModifyVars[newKey] = modifyVars[key];
  });
  return stripPrefixOfModifyVars;
}


async function buildCss(options: BuildThemeCSSOptions, config: ThemeCssConfig): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plugins: any[] = [];
  if (options.min === true) {
    plugins.push(new LessPluginCleanCSS({ advanced: true }));
  }
  return less
    .render(options.content, {
      plugins,
      paths: [
        join(root, 'node_modules/ng-zorro-antd/style/color'),
        join(root, 'node_modules/@yelon/theme/system/mixins'),
        join(root, 'node_modules'),
      ],
      ...config.buildLessOptions,
      modifyVars: {
        ...options.modifyVars,
      },
    })
    .then(res => res.css);
}

function genThemeLess(type: 'default' | 'dark' | 'compact', extraThemeVars: string[]): string[] {
  const list = [] as string[];
  // ng-zorro-antd
  if (existsSync(join(root, node_modulesPath, 'ng-zorro-antd/style'))) {
    list.push(`@import 'ng-zorro-antd/style/themes/${type}.less';`);
  }
  // @yelon
  const yelonPath = join(root, node_modulesPath, '@yelon');
  // @yelon/theme/system
  if (existsSync(join(yelonPath, 'theme'))) {
    list.push(`@import '@yelon/theme/system/theme-${type}.less';`);
    list.push(`@import '@yelon/theme/layout-default/style/theme-${type}.less';`);
    list.push(`@import '@yelon/theme/layout-blank/style/theme-${type}.less';`);
  }
  ['abc', 'chart','bis','bcs'].forEach(libName => {
    const libThemePath = join(yelonPath, libName, `theme-${type}.less`);
    if (existsSync(libThemePath)) {
      list.push(`@import '@yelon/${libName}/theme-${type}.less';`);
    }
  });

  // 外部样式 extraThemeVars
  if (Array.isArray(extraThemeVars) && extraThemeVars.length > 0) {
    list.push(
      ...extraThemeVars.map(path => {
        // 自动处理 src/app/layout/name/styles/theme-#NAME#.less之类的
        const lessFilePath = join(root, path.replace(`#NAME#`, type));
        if (!existsSync(lessFilePath)) {
          return '';
        }
        return `@import '${lessFilePath}';`;
      }),
    );
  }
  return list;
}

export async function buildThemeCSS(config: ThemeCssConfig): Promise<void> {
  node_modulesPath = config.nodeModulesPath || 'node_modules';
  config = fixConfig(config);

  const promises = config.list?.map(item => {
    // const modifyVars = genVar(config, item);
    // d(config, 'All Modify Vars', modifyVars);
    const content = [
      `@import '${config.projectStylePath}';`,
      ...config.additionalLibraries!.map(v => `@import '${v}';`),
      // 强制主题变量优先级最高
      ...genThemeLess(item.theme || 'default', config.additionalThemeVars ?? []),
    ].join('');
    const options: BuildThemeCSSOptions = {
      min: config.min,
      content,
      modifyVars: genStripVar(item),
    };
    if (existsSync(item.filePath!)) {
      unlinkSync(item.filePath!);
    }
    return buildCss(options, config)
      .then(css => {
        writeFileSync(item.filePath!, css);
        console.log(`✅ Style '${item.key}' generated successfully. Output: ${item.filePath!}`);
      })
      .catch(ex => {
        console.error(`❌ Style '${item.key}' generation failed. ${ex.message}`);
      });
  });

  await Promise.all(promises!);
}
