import { get, writable } from 'svelte/store'
import type Feed from '@dxfeed/api'
import { OptionSide } from '$lib/types'
import { getMarketDataStreamer, tastytradeSession } from './tastytrade'
import { EventType, type IEvent, type ITimeSeriesEvent } from '@dxfeed/api'

export const dxfeedConnection = writable<'not connected' | 'connecting' | 'connected'>('not connected')

let feed: Feed

export const dxfeedConnect = async () => {
	if (get(tastytradeSession) == 'invalid') {
		return
	}

	if (get(dxfeedConnection) == 'connected') {
		return
	}

	if (!feed) {
		const dxfeedAPI = await import('@dxfeed/api')
		feed = new dxfeedAPI.default()
	}

	dxfeedConnection.set('connecting')

	try {
		let resp = await getMarketDataStreamer()
		if (!resp || !('websocket-url' in resp.data)) {
			dxfeedConnection.set('not connected')
			return
		}

		feed.setAuthToken(resp.data.token)
		feed.connect(resp.data['websocket-url'])
		dxfeedConnection.set('connected')
	} catch {
		dxfeedConnection.set('not connected')
		return
	}
}

export const dxfeedDisconnect = async () => {
	if (feed) {
		dxfeedConnection.set('not connected')
		feed.disconnect()
	}
}

export const dxfeedSubscribe = async (eventTypes: EventType[], symbols: string[], onChange: (event: IEvent) => void) => {
	return feed.subscribe(eventTypes, symbols, onChange)
}

export const dxFeedGetCandles = async (symbol: string, fromTime: number, toTime: number) => {
	const events = await feed.getTimeSeries(`${symbol}{=1m}`, EventType.Candle, fromTime, toTime)

	// console.log({ d: startTime, events })
	return events
}

export const dxFeedEncodeOptionsSymbol = (symbol: string, expiration: string, side: OptionSide, strike: string | number): string => {
	let s: string = ''

	symbol = symbol.toUpperCase()
	if (symbol == 'SPX') {
		symbol = 'SPXW'
	}
	s += '.' + symbol
	s += expiration.substring(2, 4) + expiration.substring(5, 7) + expiration.substring(8, 10)
	if (side == OptionSide.call) {
		s += 'C'
	} else if (side == OptionSide.put) {
		s += 'P'
	}

	if (typeof strike == 'number') {
		strike = strike.toString()
	}

	strike = strike.replace('.00', '')
	strike = strike.replace('.0', '')
	s += strike

	return s
}

export const dxFeedDecodeOptionsSymbol = (
	symbol: string,
): {
	asset: string
	expiration: string
	side: OptionSide
	strike: string
} | undefined => {
	let asset: string
	let side: OptionSide

	if (symbol[0] == '.') {
		symbol = symbol.substring(1)
	}

	let colon = symbol.indexOf(':')
	if(colon != -1) {
		symbol = symbol.substring(0, colon)
	}

	let i: number
	for (i = symbol.length - 1; i >= 0; i--) {
		if (symbol[i] == 'C') {
			side = OptionSide.call
			break
		} else if (symbol[i] == 'P') {
			side = OptionSide.put
			break
		}
	}

	if (i <= 0) {
		return
	}

	const strike = symbol.substring(i + 1)
	const expiration = '20' + symbol.substring(i - 6, i - 4) + '-' + symbol.substring(i - 4, i - 2) + '-' + symbol.substring(i - 2, i)
	asset = symbol.substring(0, i - 6)
	if (asset == 'SPXW') {
		asset = 'SPX'
	}

	// @ts-ignore
	return { asset, expiration, side, strike }
}
