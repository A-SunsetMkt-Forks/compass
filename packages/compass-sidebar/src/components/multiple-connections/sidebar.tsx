import React, { useCallback, useState } from 'react';
import { type MapStateToProps, connect } from 'react-redux';
import {
  ConnectionStatus,
  useConnectionActions,
  useConnectionsWithStatus,
} from '@mongodb-js/compass-connections/provider';
import { type ConnectionInfo } from '@mongodb-js/connection-info';
import {
  ResizableSidebar,
  css,
  spacing,
  openToast,
  HorizontalRule,
} from '@mongodb-js/compass-components';
import { SidebarHeader } from './header/sidebar-header';
import { type RootState, type SidebarThunkAction } from '../../modules';
import { Navigation } from './navigation/navigation';
import ConnectionInfoModal from '../connection-info-modal';
import { useMaybeProtectConnectionString } from '@mongodb-js/compass-maybe-protect-connection-string';
import type { WorkspaceTab } from '@mongodb-js/compass-workspaces';
import ConnectionsNavigation from './connections-navigation';
import CSFLEConnectionModal, {
  type CSFLEConnectionModalProps,
} from '../csfle-connection-modal';
import type { ConnectionsFilter } from '../use-filtered-connections';
import { setConnectionIsCSFLEEnabled } from '../../modules/data-service';

const TOAST_TIMEOUT_MS = 5000; // 5 seconds.

type MappedCsfleModalProps = {
  connectionId: string | undefined;
} & Omit<CSFLEConnectionModalProps, 'open'>;

const mapStateForCsfleModal: MapStateToProps<
  Pick<CSFLEConnectionModalProps, 'open' | 'csfleMode'>,
  Pick<MappedCsfleModalProps, 'connectionId'>,
  RootState
> = ({ instance }, { connectionId }) => {
  const connectionInstance = connectionId ? instance[connectionId] : null;
  return {
    open: !!(connectionId && connectionInstance),
    csfleMode: connectionInstance?.csfleMode,
  };
};

const MappedCsfleModal = connect(mapStateForCsfleModal)(CSFLEConnectionModal);

type MultipleConnectionSidebarProps = {
  activeWorkspace: WorkspaceTab | null;
  onConnectionCsfleModeChanged(connectionId: string, isEnabled: boolean): void;
  onSidebarAction(action: string, ...rest: any[]): void;
  onOpenConnectViaModal?: (
    atlasMetadata: ConnectionInfo['atlasMetadata']
  ) => void;
  isCompassWeb?: boolean;
};

const sidebarStyles = css({
  // Sidebar internally has z-indexes higher than zero. We set zero on the
  // container so that the sidebar doesn't stick out in the layout z ordering
  // with other parts of the app
  zIndex: 0,
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  paddingTop: spacing[400],
  gap: spacing[200],
});

async function copyConnectionString(connectionString: string) {
  try {
    await navigator.clipboard.writeText(connectionString);
    openToast('copy-to-clipboard', {
      title: 'Success',
      description: 'Copied to clipboard.',
      variant: 'success',
      timeout: TOAST_TIMEOUT_MS,
    });
  } catch {
    openToast('copy-to-clipboard', {
      title: 'Error',
      description:
        'An error occurred when copying to clipboard. Please try again.',
      variant: 'warning',
      timeout: TOAST_TIMEOUT_MS,
    });
  }
}

export function MultipleConnectionSidebar({
  activeWorkspace,
  onSidebarAction,
  onConnectionCsfleModeChanged,
  onOpenConnectViaModal,
  isCompassWeb,
}: MultipleConnectionSidebarProps) {
  const [csfleModalConnectionId, setCsfleModalConnectionId] = useState<
    string | undefined
  >(undefined);
  const [connectionsFilter, setConnectionsFilter] = useState<ConnectionsFilter>(
    { regex: null, excludeInactive: false }
  );
  const [connectionInfoModalConnectionId, setConnectionInfoModalConnectionId] =
    useState<string | undefined>();

  const maybeProtectConnectionString = useMaybeProtectConnectionString();
  const connectionsWithStatus = useConnectionsWithStatus();
  const {
    connect,
    connectInNewWindow,
    disconnect,
    createNewConnection,
    editConnection,
    removeConnection,
    duplicateConnection,
    toggleFavoritedConnectionStatus,
    showNonGenuineMongoDBWarningModal,
  } = useConnectionActions();

  const findActiveConnection = (id: string) => {
    return connectionsWithStatus.find(
      ({ connectionInfo, connectionStatus }) => {
        return (
          connectionInfo.id === id &&
          connectionStatus === ConnectionStatus.Connected
        );
      }
    )?.connectionInfo;
  };

  const onOpenConnectionInfo = useCallback((connectionId: string) => {
    return setConnectionInfoModalConnectionId(connectionId);
  }, []);

  const onCloseConnectionInfo = useCallback(() => {
    return setConnectionInfoModalConnectionId(undefined);
  }, []);

  const onCopyConnectionString = useCallback(
    (connectionInfo: ConnectionInfo) => {
      void copyConnectionString(
        maybeProtectConnectionString(
          connectionInfo?.connectionOptions.connectionString
        )
      );
    },
    [maybeProtectConnectionString]
  );

  const onOpenCsfleModal = useCallback((connectionId: string) => {
    setCsfleModalConnectionId(connectionId);
  }, []);

  const onCloseCsfleModal = useCallback(() => {
    setCsfleModalConnectionId(undefined);
  }, []);

  const onCsfleChanged = useCallback(
    (isEnabled: boolean) => {
      if (csfleModalConnectionId) {
        onConnectionCsfleModeChanged(csfleModalConnectionId, isEnabled);
      }
    },
    [csfleModalConnectionId, onConnectionCsfleModeChanged]
  );

  return (
    <ResizableSidebar data-testid="navigation-sidebar" useNewTheme={true}>
      <aside className={sidebarStyles}>
        <>
          <SidebarHeader
            onAction={onSidebarAction}
            isCompassWeb={isCompassWeb}
          />
          <Navigation currentLocation={activeWorkspace?.type ?? null} />
          <HorizontalRule />
        </>
        <ConnectionsNavigation
          connectionsWithStatus={connectionsWithStatus}
          activeWorkspace={activeWorkspace}
          filter={connectionsFilter}
          onFilterChange={setConnectionsFilter}
          onConnect={(connectionInfo) => {
            void connect(connectionInfo);
          }}
          onConnectInNewWindow={connectInNewWindow}
          onNewConnection={createNewConnection}
          onEditConnection={(connectionInfo) => {
            editConnection(connectionInfo.id);
          }}
          onRemoveConnection={(connectionInfo) => {
            void removeConnection(connectionInfo.id);
          }}
          onDuplicateConnection={(connectionInfo) => {
            void duplicateConnection(connectionInfo.id);
          }}
          onCopyConnectionString={onCopyConnectionString}
          onToggleFavoriteConnectionInfo={(connectionInfo) => {
            void toggleFavoritedConnectionStatus(connectionInfo.id);
          }}
          onOpenConnectionInfo={onOpenConnectionInfo}
          onDisconnect={(id) => {
            void disconnect(id);
          }}
          onOpenCsfleModal={onOpenCsfleModal}
          onOpenNonGenuineMongoDBModal={(connectionId: string) => {
            showNonGenuineMongoDBWarningModal(connectionId);
          }}
          onOpenConnectViaModal={onOpenConnectViaModal}
        />
        <MappedCsfleModal
          connectionId={csfleModalConnectionId}
          onClose={onCloseCsfleModal}
          setConnectionIsCSFLEEnabled={onCsfleChanged}
        />
        <ConnectionInfoModal
          connectionInfo={
            connectionInfoModalConnectionId
              ? findActiveConnection(connectionInfoModalConnectionId)
              : undefined
          }
          isVisible={!!connectionInfoModalConnectionId}
          close={onCloseConnectionInfo}
        />
      </aside>
    </ResizableSidebar>
  );
}

const onSidebarAction = (
  action: string,
  ...rest: any[]
): SidebarThunkAction<void> => {
  return (_dispatch, _getState, { globalAppRegistry }) => {
    globalAppRegistry.emit(action, ...rest);
  };
};

const MappedMultipleConnectionSidebar = connect(undefined, {
  onSidebarAction,
  onConnectionCsfleModeChanged: setConnectionIsCSFLEEnabled,
})(MultipleConnectionSidebar);

export default MappedMultipleConnectionSidebar;
