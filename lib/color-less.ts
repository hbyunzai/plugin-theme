import { ColorLessConfig } from './color-less.types';
import { deepMergeKey } from './utils';
import { generateTheme } from './color-generator';
import { existsSync, unlinkSync } from 'fs';

const primaryColorVariable = '@primary-color';

function fixConfig(config: ColorLessConfig): ColorLessConfig {
  config = deepMergeKey(
    {
      variables: [],
      ngZorroAntd: `./node_modules/ng-zorro-antd/`,
      styleFilePath: `./src/styles.less`,
      themeFilePath: `./src/styles/theme.less`,
      outputFilePath: `./src/assets/color.less`,
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
