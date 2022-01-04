/**
 * The idea comes from [antd-theme-generator](https://github.com/mzohaibqc/antd-theme-generator/blob/master/index.js)
 */

import less from 'less';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
const lessToJs = require('less-vars-to-js');
const postcss = require('postcss');
const LessPluginCleanCSS = require('less-plugin-clean-css');
const LessPluginNpmImport = require('less-plugin-npm-import');

import { ColorLessConfig, ColorLessKV } from './color-less.types';
import { d } from './utils';

const root = process.cwd();
let nodeModulesPath = '';

async function buildLess(content: string, min: boolean, config: ColorLessConfig): Promise<string> {
  const plugins = [new LessPluginNpmImport({ prefix: '~' })];
  if (min) {
    plugins.push(new LessPluginCleanCSS({ advanced: true }));
  }
  const options = {
    javascriptEnabled: true,
    plugins,
    paths: ['node_modules/'],
    ...config.buildLessOptions,
  };
  if (config.debug) console.log(options);
  const res = await less.render(content, options);
  return res.css;
}

/**
 * 扁平化所有 less 文件
 */
function combineLess(filePath: string): string {
  if (!existsSync(filePath)) {
    return '';
  }
  const fileContent = readFileSync(filePath).toString();
  const directory = dirname(filePath);
  return fileContent
    .split('\n')
    .map((line: string) => {
      if (!line.startsWith('@import')) {
        return line;
      }
      let importPath = line.match(/@import\ ["'](.*)["'];/)![1];
      if (!importPath.endsWith('.less')) {
        importPath += '.less';
      }
      let newPath = join(directory, importPath);
      if (importPath.startsWith('~')) {
        importPath = importPath.replace('~', '');
        newPath = join(nodeModulesPath, `./${importPath}`);
      }
      return combineLess(newPath);
    })
    .join('\n');
}

/*
  Generated random hex color code
  e.g. #fe12ee
*/
function randomColor() {
  return '#' + (0x1000000 + Math.random() * 0xffffff).toString(16).substr(1, 6);
}

/*
  This function take primary color palette name and returns @primary-color dependent value
  .e.g
  Input: @primary-1
  Output: color(~`colorPalette("@{primary-color}", ' 1 ')`)
*/
function getShade(varName: string) {
  const match = varName.match(/(.*)-(\d)/)!;
  let className = match[1];
  if (/primary-\d/.test(varName)) {
    className = '@primary-color';
  }
  return 'color(~`colorPalette("@{' + className.replace('@', '') + '}", ' + match[2] + ')`)';
}

function generateColorMap(themeFilePath: string): ColorLessKV {
  const varFileContent = combineLess(themeFilePath);
  const mappings = lessToJs(varFileContent, {
    stripPrefix: false,
    resolveVariables: false,
  });
  return mappings;
}

function getMatches(string: string, regex: RegExp): ColorLessKV {
  const matches: ColorLessKV = {};
  let match;
  while ((match = regex.exec(string))) {
    if (match[2].startsWith('rgba') || match[2].startsWith('#')) {
      matches[`@${match[1]}`] = match[2];
    }
  }
  return matches;
}

async function getValidThemeVars(
  mappings: ColorLessKV,
  variables: string[],
  antdPath: string,
  config: ColorLessConfig,
): Promise<{ themeVars: string[]; randomColors: ColorLessKV; randomColorsVars: ColorLessKV; themeCompiledVars: ColorLessKV }> {
  const randomColors: ColorLessKV = {};
  const randomColorsVars: ColorLessKV = {};
  // 根据定制color重新生成一组随机颜色
  const themeVars: string[] = variables.filter((name: any) => name in mappings && !name.match(/(.*)-(\d)/));
  const themeVarsCss: string[] = [];
  themeVars.forEach((varName: any) => {
    let color = randomColor();
    while (randomColorsVars[color]) {
      color = randomColor();
    }
    randomColors[varName] = color;
    randomColorsVars[color] = varName;
    themeVarsCss.push(`.${varName.replace('@', '')} { color: ${color}; }`);
  });
  // ANTD 规定每个颜色都有9种衍生色
  const varsContent: string[] = [];
  themeVars.forEach(varName => {
    [1, 2, 3, 4, 5, 7, 8, 9, 10].forEach(key => {
      const name = varName === '@primary-color' ? `@primary-${key}` : `${varName}-${key}`;
      themeVarsCss.push(`.${name.replace('@', '')} { color: ${getShade(name)}; }`);
    });
    varsContent.push(`${varName}: ${randomColors[varName]};`);
  });
  // 利用 colors.less 生成
  const colorFileContent = combineLess(join(antdPath, './style/color/colors.less'));
  const css = await buildLess(`${colorFileContent}\n${varsContent.join('\n')}\n${themeVarsCss.reverse().join('\n')}`, false, config);
  const regex = /.(?=\S*['-])([.a-zA-Z0-9'-]+)\ {\n {2}color: (.*);/g;
  const themeCompiledVars = getMatches(css.replace(/(\/.*\/)/g, ''), regex);
  return { themeVars, randomColors, randomColorsVars, themeCompiledVars };
}

export async function generateTheme(config: ColorLessConfig): Promise<string> {
  nodeModulesPath = join(root, config.nodeModulesPath || 'node_modules');
  try {
    const mappings = generateColorMap(config.themeFilePath!);
    // 1、生成所有样式的变量以及对应的 1-9 ANTD规则
    const { themeVars, themeCompiledVars } = await getValidThemeVars(mappings, config.variables!, config.ngZorroAntd!, config);
    // 2、根据这些规则重新编译整个样式
    const varsCombined: string[] = [];
    themeVars.forEach(varName => {
      let color;
      if (/(.*)-(\d)/.test(varName)) {
        color = getShade(varName);
        return;
      } else {
        color = themeCompiledVars[varName];
      }
      varsCombined.push(`${varName}: ${color};`);
    });
    const allLessContent = `
    @import '${config.styleFilePath!}';
    ${varsCombined.join('\n')}
  `;
    d(config, `All vars`, allLessContent);

    let css = await buildLess(allLessContent, false, config);
    // 3、根据 postcss 来清除非 color 部分
    css = await postcss([reducePlugin]).process(css).css;
    // 4、将随机颜色替换回相应的变量名
    Object.keys(themeCompiledVars).forEach(varName => {
      let color;
      if (/(.*)-(\d)/.test(varName)) {
        color = themeCompiledVars[varName];
        varName = getShade(varName);
      } else {
        color = themeCompiledVars[varName];
      }
      color = color.replace('(', '\\(').replace(')', '\\)');
      css = css.replace(new RegExp(color, 'g'), `${varName}`);
    });
    css = css.replace(/@[\w-_]+:\s*.*;[\/.]*/gm, '').replace(/\\9/g, '');
    // 5、插入所有变量并替换 @primary-color
    const antdStyle = combineLess(join(config.ngZorroAntd!, './style/themes/default.less'));
    css += `\n\n${antdStyle}`;

    themeVars.reverse().forEach(varName => {
      css = css.replace(new RegExp(`${varName}( *):(.*);`, 'g'), '');
      css = `${varName}: ${mappings[varName]};\n${css}\n`;
    });

    css = minifyCss(css);
    // 6、保存
    if (config.outputFilePath) {
      writeFileSync(config.outputFilePath, css);
      console.log(`✅ Color less generated successfully. Output: ${config.outputFilePath}`);
    } else {
      console.log('Theme generated successfully');
    }
    return css;
  } catch (ex) {
    console.log('error', ex);
    return '';
  }
}

/*
 This plugin will remove all css rules except those are related to colors
 e.g.
 Input:
 .body {
    font-family: 'Lato';
    background: #cccccc;
    color: #000;
    padding: 0;
    pargin: 0
 }

 Output:
  .body {
    background: #cccccc;
    color: #000;
 }
*/
const reducePlugin = postcss.plugin('reducePlugin', () => {
  const cleanRule = (rule: any) => {
    if (rule.selector.startsWith('.main-color .palatte-')) {
      rule.remove();
      return;
    }

    let removeRule = true;
    rule.walkDecls((decl: any) => {
      if (String(decl.value).match(/url\(.*\)/g)) {
        decl.remove();
      }
      const matched = false;
      /*
      this block causing https://github.com/ant-design/ant-design/issues/24777
      if (decl.prop !== 'background' && decl.prop.includes('background') && !decl.prop.match(/^background-(.*)color$/ig)) {
        decl.remove();
        matched = true;
      }
      if (decl.prop !== 'border' && decl.prop.includes('border') && !decl.prop.match(/^border-(.*)color$/ig)) {
        decl.remove();
        matched = true;
      }
      if (['transparent', 'inherit', 'none', '0'].includes(decl.value)) {
        decl.remove();
        matched = true;
      }
      */
      if (
        !decl.prop.includes('color') &&
        !decl.prop.includes('background') &&
        !decl.prop.includes('border') &&
        !decl.prop.includes('box-shadow') &&
        !Number.isNaN(decl.value)
      ) {
        // if (!matched) decl.remove();
        decl.remove();
      } else {
        removeRule = matched ? removeRule : false;
      }
    });
    if (removeRule) {
      rule.remove();
    }
  };
  return (css: any) => {
    css.walkAtRules((atRule: any) => {
      atRule.remove();
    });

    css.walkRules(cleanRule);

    css.walkComments((c: any) => c.remove());
  };
});

function minifyCss(css: string) {
  // Removed all comments and empty lines
  css = css.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').replace(/^\s*$(?:\r\n?|\n)/gm, '');

  /*
  Converts from

    .abc,
    .def {
      color: red;
      background: blue;
      border: grey;
    }

    to

    .abc,
    .def {color: red;
      background: blue;
      border: grey;
    }

  */
  css = css.replace(/\{(\r\n?|\n)\s+/g, '{');

  /*
  Converts from

  .abc,
  .def {color: red;
  }

  to

  .abc,
  .def {color: red;
    background: blue;
    border: grey;}

  */
  css = css.replace(/;(\r\n?|\n)\}/g, ';}');

  /*
  Converts from

  .abc,
  .def {color: red;
    background: blue;
    border: grey;}

  to

  .abc,
  .def {color: red;background: blue;border: grey;}

  */
  css = css.replace(/;(\r\n?|\n)\s+/g, ';');

  /*
Converts from

.abc,
.def {color: red;background: blue;border: grey;}

to

.abc, .def {color: red;background: blue;border: grey;}

*/
  css = css.replace(/,(\r\n?|\n)[.]/g, ', .');
  return css;
}
