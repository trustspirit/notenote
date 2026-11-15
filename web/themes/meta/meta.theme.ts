// The meta theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in meta.settings.json and the generated meta.settings.ts;
// change them with `astryx experimental theme editor set meta ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {metaSettings} from './meta.settings';

export const metaTheme = defineTheme({
  extends: metaSettings,
  name: 'meta',
});
