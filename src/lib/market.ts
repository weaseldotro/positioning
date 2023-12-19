import { writable } from 'svelte/store'
import { getEquitiesMarketTime, type EquitiesMarketTime, type FuturesMarketTime, getFuturesMarketTime, getRiskFreeRate } from './tastytrade'

export const trades = writable<Record<string, number>>({})

export interface MarketData {
	equitiesMarketTime: EquitiesMarketTime
	futuresMarketTime: FuturesMarketTime
	riskFreeRate: number
}

let marketData: MarketData

export const initMarketData = async () => {
	//@ts-ignore
	marketData = {}

	let promises = await Promise.all([getEquitiesMarketTime(), getFuturesMarketTime(), getRiskFreeRate()])
	marketData.equitiesMarketTime = promises[0]
	promises[1].forEach(marketTime => {
		if (marketTime['instrument-collection'] == 'CME') {
			marketData.futuresMarketTime = marketTime
		}
	})


	let fromTime: number
	let toTime: number
	// if(marketTimes.equities.state == 'Closed') {
	fromTime = new Date(marketData.equitiesMarketTime['previous-session']['close-at']).getTime() - 3600000
	toTime = fromTime + 3600000
	// }

	marketData.riskFreeRate = promises[2]
	// marketData.riskFreeRate = 0.0001
}

export const getMarketData = (): MarketData => {
	return marketData
}
