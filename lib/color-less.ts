import { ColorLessConfig } from './color-less.types';
import { deepMergeKey, getJSON } from './utils';
import { generateTheme } from './color-generator';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const primaryColorVariable = '@primary-color';
const root = process.cwd();

function fixConfig(config: ColorLessConfig): ColorLessConfig {
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
      variables: [],
      ngZorroAntd: `./node_modules/ng-zorro-antd/`,
      styleFilePath: `./${styleSourceRoot}/styles.less`,
      themeFilePath: `./${styleSourceRoot}/styles/theme.less`,
      outputFilePath: `./${styleSourceRoot}/assets/color.less`,
      thirdLibaryNames: ['@yelon', 'ng-zorro-antd'],
    } as ColorLessConfig,
    false,
    config,
  );

  if (!Array.isArray(config.variables)) {
    config.variables = [];
  }

  if (!config.variables.includes(primaryColorVariable)) {
    config.variables.push(primaryColorVariable);
  }

  return config;
}

export async function genColorLess(config: ColorLessConfig): Promise<void> {
  config = fixConfig(config);

  if (existsSync(config.outputFilePath!)) {
    unlinkSync(config.outputFilePath!);
  }

  await generateTheme(config);
}
