import React, { useCallback, useEffect, useState } from 'react';
import d3 from 'd3';
import {
  Button,
  Icon,
  css,
  cx,
  spacing,
  palette,
  useDarkMode,
} from '@mongodb-js/compass-components';
import { useTelemetry } from '@mongodb-js/compass-telemetry/provider';

import Actions from '../actions';
import ServerStatsStore from '../stores/server-stats-graphs-store';
import { useConnectionInfoRef } from '@mongodb-js/compass-connections/provider';

const serverStatsToolbarStyles = css({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: spacing[400],
});

const serverStatsToolbarDarkThemeStyles = css({
  background: palette.black,
  color: palette.gray.light2,
});

const serverStatsToolbarLightThemeStyles = css({
  background: palette.white,
  color: palette.black,
});

const timeStyles = css({
  padding: `${spacing[200]}px ${spacing[800]}px`,
  borderRadius: '3px',
  marginLeft: spacing[200],
});

const timeLightThemeStyles = css({
  background: palette.gray.light2,
  color: palette.gray.dark1,
});

const timeDarkThemeStyles = css({
  background: palette.gray.dark2,
  color: palette.gray.light2,
});

export type TimeScrubEventDispatcher = {
  on: (eventName: 'newXValue', handler: (xDate: Date) => void) => void;
};

type ServerStatsToolbarProps = {
  eventDispatcher: TimeScrubEventDispatcher;
};

function ServerStatsToolbar({ eventDispatcher }: ServerStatsToolbarProps) {
  const track = useTelemetry();
  const connectionInfoRef = useConnectionInfoRef();
  const darkMode = useDarkMode();

  const [time, setTime] = useState('00:00:00');
  const [isPaused, setPaused] = useState((ServerStatsStore as any).isPaused);

  useEffect(() => {
    eventDispatcher.on('newXValue', (xDate) => {
      // When the cursor position results in a new time on the graphs, by user
      // scrubbing or live viewing, we receive a new time to display.
      setTime((d3 as any).time.format.utc('%X')(xDate) as string);
    });
  }, [eventDispatcher]);

  const onPlayPauseClicked = useCallback(() => {
    const connectionInfo = connectionInfoRef.current;
    if (isPaused) {
      track('Performance Resumed', {}, connectionInfo);
    } else {
      track('Performance Paused', {}, connectionInfo);
    }
    setPaused(!isPaused);
    Actions.pause();
  }, [isPaused, track, connectionInfoRef]);

  return (
    <div
      className={cx(
        serverStatsToolbarStyles,
        darkMode
          ? serverStatsToolbarDarkThemeStyles
          : serverStatsToolbarLightThemeStyles
      )}
    >
      <Button
        onClick={onPlayPauseClicked}
        leftGlyph={<Icon glyph={isPaused ? 'Play' : 'Pause'} />}
        variant={isPaused ? 'primary' : 'default'}
      >
        {isPaused ? 'Play' : 'Pause'}
      </Button>
      <div
        className={cx(
          timeStyles,
          darkMode ? timeDarkThemeStyles : timeLightThemeStyles
        )}
        data-testid="server-stats-time"
      >
        {time}
      </div>
    </div>
  );
}

export { ServerStatsToolbar };
