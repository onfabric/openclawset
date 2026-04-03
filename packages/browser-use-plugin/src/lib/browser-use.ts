import type { RunTaskOptions } from 'browser-use-sdk';

export type CountryCode = NonNullable<RunTaskOptions['sessionSettings']>['proxyCountryCode'];
