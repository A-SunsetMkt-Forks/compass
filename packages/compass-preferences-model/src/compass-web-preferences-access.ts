import { createNoopLogger } from '@mongodb-js/compass-logging/provider';
import { Preferences, type PreferencesAccess } from './preferences';
import type { UserPreferences } from './preferences-schema';
import { type AllPreferences } from './preferences-schema';
import { InMemoryStorage } from './preferences-in-memory-storage';
import { getActiveUser } from './utils';

const editablePreferences: (keyof UserPreferences)[] = [
  // Value can change from false to true during allocation / checking
  'optInDataExplorerGenAIFeatures',
  'cloudFeatureRolloutAccess',
  // TODO(COMPASS-9353): Provide a standard for updating Compass preferences in web
  'enableIndexesGuidanceExp',
  'showIndexesGuidanceVariant',

  // Exposed for testing purposes.
  'enableGenAISampleDocumentPassingOnAtlasProject',
  'enableGenAIFeaturesAtlasOrg',
  'enableGenAIFeaturesAtlasProject',
  'enableDataModeling',
];

export class CompassWebPreferencesAccess implements PreferencesAccess {
  private _preferences: Preferences;
  constructor(preferencesOverrides?: Partial<AllPreferences>) {
    this._preferences = new Preferences({
      logger: createNoopLogger(),
      preferencesStorage: new InMemoryStorage(preferencesOverrides),
    });
  }

  savePreferences(_attributes: Partial<UserPreferences>) {
    // Only allow runtime updating certain preferences.
    if (
      Object.keys(_attributes).length >= 1 &&
      Object.keys(_attributes).every((attribute) =>
        editablePreferences.includes(attribute as keyof UserPreferences)
      )
    ) {
      return Promise.resolve(this._preferences.savePreferences(_attributes));
    }
    return Promise.resolve(this._preferences.getPreferences());
  }

  refreshPreferences() {
    return Promise.resolve(this._preferences.getPreferences());
  }

  getPreferences() {
    return this._preferences.getPreferences();
  }

  ensureDefaultConfigurableUserPreferences() {
    return this._preferences.ensureDefaultConfigurableUserPreferences();
  }

  getConfigurableUserPreferences() {
    return Promise.resolve(this._preferences.getConfigurableUserPreferences());
  }

  getPreferenceStates() {
    return Promise.resolve(this._preferences.getPreferenceStates());
  }

  onPreferenceValueChanged<K extends keyof AllPreferences>(
    preferenceName: K,
    callback: (value: AllPreferences[K]) => void
  ) {
    return this._preferences.onPreferencesChanged(
      (preferences: Partial<AllPreferences>) => {
        if (Object.keys(preferences).includes(preferenceName)) {
          return callback((preferences as AllPreferences)[preferenceName]);
        }
      }
    );
  }

  createSandbox() {
    return Promise.resolve(
      new CompassWebPreferencesAccess(this.getPreferences())
    );
  }

  getPreferencesUser() {
    return getActiveUser(this);
  }
}
