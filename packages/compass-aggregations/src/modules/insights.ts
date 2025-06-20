import type { Action, Reducer } from 'redux';
import type { Stage } from '@mongodb-js/explain-plan-helper';
import { ExplainPlan } from '@mongodb-js/explain-plan-helper';
import { getPipelineFromBuilderState } from './pipeline-builder/builder-helpers';
import { cancellableWait } from '@mongodb-js/compass-utils';
import type { PipelineBuilderThunkAction } from '.';
import type { NewPipelineConfirmedAction } from './is-new-pipeline-confirm';
import { ActionTypes as ConfirmNewPipelineActions } from './is-new-pipeline-confirm';
import type { RestorePipelineAction } from './saved-pipeline';
import { RESTORE_PIPELINE } from './saved-pipeline';
import type {
  LoadGeneratedPipelineAction,
  PipelineGeneratedFromQueryAction,
} from './pipeline-builder/pipeline-ai';
import { AIPipelineActionTypes } from './pipeline-builder/pipeline-ai';
import { getStageOperator, isOutputStage } from '../utils/stage';
import { isAction } from '../utils/is-action';

const FETCH_EXPLAIN_PLAN_SUCCESS =
  'compass-aggregations/FETCH_EXPLAIN_PLAN_SUCCESS' as const;
interface FetchExplainPlanSuccessAction {
  type: typeof FETCH_EXPLAIN_PLAN_SUCCESS;
  explainPlan: ExplainPlan;
}
export type InsightsAction = FetchExplainPlanSuccessAction;

const INITIAL_STATE = { isCollectionScan: false };

const reducer: Reducer<{ isCollectionScan: boolean }, Action> = (
  state = INITIAL_STATE,
  action
) => {
  if (
    isAction<FetchExplainPlanSuccessAction>(action, FETCH_EXPLAIN_PLAN_SUCCESS)
  ) {
    return {
      ...state,
      isCollectionScan: action.explainPlan.isCollectionScan,
    };
  }
  if (
    isAction<NewPipelineConfirmedAction>(
      action,
      ConfirmNewPipelineActions.NewPipelineConfirmed
    ) ||
    isAction<LoadGeneratedPipelineAction>(
      action,
      AIPipelineActionTypes.LoadGeneratedPipeline
    ) ||
    isAction<PipelineGeneratedFromQueryAction>(
      action,
      AIPipelineActionTypes.PipelineGeneratedFromQuery
    ) ||
    isAction<RestorePipelineAction>(action, RESTORE_PIPELINE)
  ) {
    return { ...INITIAL_STATE };
  }
  return state;
};

const ExplainFetchAbortControllerMap = new Map<string, AbortController>();

function getAbortSignal(id: string) {
  ExplainFetchAbortControllerMap.get(id)?.abort();
  const controller = new AbortController();
  ExplainFetchAbortControllerMap.set(id, controller);
  return controller.signal;
}

export const fetchExplainForPipeline = (): PipelineBuilderThunkAction<
  Promise<void>
> => {
  return async (dispatch, getState, { pipelineBuilder }) => {
    const { id, namespace, dataService, maxTimeMS } = getState();
    const abortSignal = getAbortSignal(id);
    try {
      // Debounce action to allow for user typing to stop
      await cancellableWait(300, abortSignal);
      const pipeline = getPipelineFromBuilderState(
        getState(),
        pipelineBuilder
      ).filter((stage) => {
        // Getting explain plan for a pipeline with an out / merge stage can
        // cause data corruption issues in non-genuine MongoDB servers, for
        // example CosmosDB actually executes pipeline and persists data, even
        // when the stage is not at the end of the pipeline. To avoid
        // introducing branching logic based on MongoDB genuineness, we just
        // filter out all output stages here instead
        return !isOutputStage(getStageOperator(stage));
      });
      const rawExplainPlan = await dataService.dataService?.explainAggregate?.(
        namespace,
        pipeline,
        { maxTimeMS: maxTimeMS ?? undefined },
        { explainVerbosity: 'queryPlanner', abortSignal }
      );
      const explainPlan = new ExplainPlan(rawExplainPlan as Stage);
      dispatch({ type: FETCH_EXPLAIN_PLAN_SUCCESS, explainPlan });
      ExplainFetchAbortControllerMap.delete(id);
    } catch {
      // We are only fetching this to get information about index usage for
      // insight badge, if this fails for any reason: server, cancel, error
      // getting pipeline from state, or parsing explain plan. Whatever it is,
      // we don't care and ignore it
    }
  };
};

export const openCreateIndexModal = (): PipelineBuilderThunkAction<void> => {
  return (_dispatch, _getState, { localAppRegistry }) => {
    localAppRegistry.emit('open-create-index-modal');
  };
};

export default reducer;
