export interface ProviderExchangeRate {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  rateDate: string;
}

export interface ExchangeRateProvider {
  getLatestRates(baseCurrency: string): Promise<ProviderExchangeRate[]>;
}
