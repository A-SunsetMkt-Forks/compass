import type { RootAction, SchemaValidationThunkAction } from '.';
import { enableEditRules } from './edit-mode';

/**
 * Zero state changed action.
 */
export const IS_ZERO_STATE_CHANGED =
  'validation/namespace/IS_ZERO_STATE_CHANGED' as const;
interface IsZeroStateChangedAction {
  type: typeof IS_ZERO_STATE_CHANGED;
  isZeroState: boolean;
}

export type IsZeroStateAction = IsZeroStateChangedAction;
export type IsZeroStateState = boolean;

/**
 * The initial state.
 */
export const INITIAL_STATE: IsZeroStateState = true;

/**
 * Reducer function for handle state changes to namespace.
 */
export default function reducer(
  state: IsZeroStateState = INITIAL_STATE,
  action: RootAction
): IsZeroStateState {
  if (action.type === IS_ZERO_STATE_CHANGED) {
    return action.isZeroState;
  }

  return state;
}

/**
 * Action creator for zero state changed events.
 */
export const zeroStateChanged = (
  isZeroState: boolean
): IsZeroStateChangedAction => ({
  type: IS_ZERO_STATE_CHANGED,
  isZeroState,
});

/**
 * Change zero state.
 */
export const changeZeroState = (
  isZeroState: boolean
): SchemaValidationThunkAction<void> => {
  return (dispatch, _getState, { track, connectionInfoRef }) => {
    if (isZeroState === false) {
      track('Schema Validation Added', {}, connectionInfoRef.current);
    }
    dispatch(enableEditRules());
    return dispatch(zeroStateChanged(isZeroState));
  };
};
