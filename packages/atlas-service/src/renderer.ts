import { registerCompassPlugin } from '@mongodb-js/compass-app-registry';
import { activatePlugin } from './store/atlas-signin-store';
import { atlasAuthServiceLocator } from './provider';

export const AtlasAuthPlugin = registerCompassPlugin(
  {
    name: 'AtlasAuth',
    component: () => null,
    activate: activatePlugin,
  },
  {
    atlasAuthService: atlasAuthServiceLocator,
  }
);
export default AtlasAuthPlugin;
export { AtlasServiceError } from './util';
export type { AtlasUserInfo } from './util';
export { CompassAtlasAuthService } from './compass-atlas-auth-service';
