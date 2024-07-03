/**
 * The idea comes from [antd-theme-generator](https://github.com/mzohaibqc/antd-theme-generator/blob/master/index.js)
 */

import less from 'less';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import postcss, { AtRule, Declaration, Plugin, Rule } from 'postcss';

import { ColorLessConfig, ColorLessKV } from './color-less.types';
import { d } from './utils';
const lessToJs = require('less-vars-to-js');
const syntax = require('postcss-less');

const root = process.cwd();
let nodeModulesPath = '';

async function buildLess(content: string, config: ColorLessConfig): Promise<string> {
  const options = {
    paths: [
      join(root, 'node_modules/ng-zorro-antd/style/color'),
      join(root, 'node_modules/@yelon/theme/system/mixins'),
      join(root, 'node_modules'),
    ],
    ...config.buildLessOptions,
  };
  try {
    const res = await less.render(content, options);
    return res.css;
  } catch (ex) {
    throw new Error(`Less build error: ${ex}`);
  }
}


/**
 * 扁平化所有 less 文件
 */
function combineLess(filePath: string, config: ColorLessConfig): string {
  if (!existsSync(filePath)) {
    return '';
  }
  const fileContent = readFileSync(filePath).toString();
  const directory = dirname(filePath);
  const arr = fileContent.split('\n').map((line: string) => {
    if (!line.startsWith('@import')) {
      return line;
    }
    let importPath = line.match(/@import ["'](.*)["'];/)![1];
    if (!importPath.endsWith('.less')) {
      importPath += '.less';
    }
    let newPath = join(directory, importPath);
    const startKeys = ['~'];
    const startKeyIndex = startKeys.findIndex(key => importPath.startsWith(key));
    if (startKeyIndex !== -1) {
      importPath = importPath.replace(startKeys[startKeyIndex], '');
      newPath = join(nodeModulesPath, importPath);
    }
    if (config.thirdLibraryNames != null && config.thirdLibraryNames.some(key => importPath.startsWith(key))) {
      newPath = join(nodeModulesPath, importPath);
    }
    return combineLess(newPath, config);
  });
  return arr.join('\n');
}

/*
  Generated random hex color code
  e.g. #fe12ee
*/
function randomColor() {
  return '#' + (0x1000000 + Math.random() * 0xffffff).toString(16).substring(1, 7);
}

/*
  This function take primary color palette name and returns @primary-color dependent value
  .e.g
  Input: @primary-1
  Output: color(colorPalette("@primary-color", ' 1 '))
*/
function getShade(varName: string) {
  const match = varName.match(/(.*)-(\d)/);
  if (match == null) return '';

  let className = match[1];
  if (/primary-\d/.test(varName)) {
    className = '@primary-color';
  }
  return 'color(colorPalette("@' + className.replace('@', '') + '", ' + match[2] + '))';
}

function generateColorMap(themeFilePath: string, config: ColorLessConfig): ColorLessKV {
  const varFileContent = combineLess(themeFilePath, config);
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
  const themeVars: string[] = variables.filter(name => name in mappings && !name.match(/(.*)-(\d)/));
  const themeVarsCss: string[] = [];
  themeVars.forEach(varName => {
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
  const colorFileContent = combineLess(join(antdPath, './style/color/colors.less'), config);
  const css = await buildLess(`${colorFileContent}\n${varsContent.join('\n')}\n${themeVarsCss.reverse().join('\n')}`, config);
  const regex = /.(?=\S*['-])?([.a-zA-Z0-9'-]+) {\n {2}color: (.*);/g;
  const themeCompiledVars = getMatches(css.replace(/(\/.*\/)/g, ''), regex);

  return { themeVars, randomColors, randomColorsVars, themeCompiledVars };
}

export async function generateTheme(config: ColorLessConfig): Promise<string> {
  nodeModulesPath = join(root, config.nodeModulesPath || 'node_modules');
  try {
    const mappings = generateColorMap(config.themeFilePath!, config);
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
    d(config, 'All vars', allLessContent);

    let css = await buildLess(allLessContent, config);
    // 3、根据 postcss 来清除非 color 部分
    css = (await postcss([reducePlugin()]).process(css, { from: undefined })).css;
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
    // eslint-disable-next-line no-useless-escape
    css = css.replace(/@[\w-_]+:\s*.*;[\/.]*/gm, '').replace(/\\9/g, '');
    // 5、插入所有变量并替换 @primary-color
    const allVar = combineLess(config.themeFilePath!, config);
    const SPLIT_ALL_VAR_KEY = '/* SPLIT_ALL_VAR_KEY */';
    css += `\n\n${SPLIT_ALL_VAR_KEY}\n\n${allVar}`;

    themeVars.reverse().forEach(varName => {
      css = css.replace(new RegExp(`${varName}( *):(.*);`, 'g'), '');
      css = `${varName}: ${mappings[varName]};\n${css}\n`;
    });

    // 6、清除非Color变量部分
    const splitANTDArr = css.split(SPLIT_ALL_VAR_KEY);
    if (splitANTDArr.length === 2) {
      const cleanNoColor = (await postcss([cleanNoColorVarPlugin()]).process(splitANTDArr[0], { from: undefined, syntax })).css;
      css = cleanNoColor + splitANTDArr[1];
    }

    css = minifyCss(css);
    // 7、保存
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
const reducePlugin: () => Plugin = () => {
  const cleanRule = (rule: Rule) => {
    let removeRule = true;
    rule.walkDecls(decl => {
      if (decl.value.match(/url\(.*\)/g)) {
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
  return {
    postcssPlugin: 'reducePlugin',
    Once: css => {
      css.walkAtRules((atRule: AtRule) => {
        atRule.remove();
      });

      css.walkRules(cleanRule);

      css.walkComments(c => {
        c.remove();
      });
    },
  };
};

const cleanNoColorVarPlugin: () => Plugin = () => {
  const cleanRule = (rule: Rule) => {
    rule.walkDecls((decl: Declaration) => {
      if (decl.value.startsWith('@')) {
        return;
      }
      decl.remove();
    });
    if (rule.nodes.length === 0) {
      rule.remove();
    }
  };
  return {
    postcssPlugin: 'cleanNoColorVarPlugin',
    Once: css => {
      css.walkRules(cleanRule);
    },
  };
};

function minifyCss(css: string) {
  // Removed all comments and empty lines
  css = css.replace(/\/\*[\s\S]*?\*\/|\/\/ .*/g, '').replace(/^\s*$(?:\r\n?|\n)/gm, '');

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
