import * as React from 'react';
import { isProLiteConsole } from '../../utils';
import { OpenTelemetryProvider } from './OpenTelemetryProvider/OpenTelemetryProvider';

export function OpenTelemetryFeature() {
  // Please note: checking where the feature is visible or not should not be in the scope of the
  // feature itself. Theoretically, the router's config should avoid managing the route in some
  // circumstances, and the sidebar button should be rendered or not based on the same condition.
  // But the feature itself should not be aware of when it's rendered or not.

  // eslint-disable-next-line no-underscore-dangle
  if (!isProLiteConsole(window.__env)) return null;

  return <OpenTelemetryProvider />;
}
