import React from 'react';
import {
  Button,
  type ItemComponentProps,
} from '@mongodb-js/compass-components';
import type { Actions } from './constants';

type ConnectButtonProps = ItemComponentProps<Actions>;

export function ConnectButton({
  action,
  tooltip,
  label,
  iconSize,
  iconStyle,
  isDisabled,
  onClick,
  className,
  'data-testid': testId,
}: ConnectButtonProps) {
  return (
    <Button
      key={action}
      title={!tooltip ? label : undefined}
      size={iconSize}
      data-action={action}
      data-testid={testId}
      onClick={onClick}
      className={className}
      style={iconStyle}
      disabled={isDisabled}
    >
      {label}
    </Button>
  );
}
