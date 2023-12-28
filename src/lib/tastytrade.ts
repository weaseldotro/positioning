import { OptionSide, type Instrument, PriceEffect } from '$lib/types'
import Cookies from 'js-cookie'
import { writable } from 'svelte/store'
import { dxFeedEncodeOptionsSymbol, dxfeedConnect, dxfeedDisconnect } from './dxfeed'

export const tastytradeConnection = writable<'not connected' | 'connecting' | 'connected'>('not connected')
export const tastytradeSession = writable<'checking' | 'valid' | 'invalid'>('checking')
export const tastytradeAccount = writable<string>('')

let APIURL = 'https://api.tastytrade.com'
let token: string = ''

export const tastytradeConnect = async () => {
	tastytradeConnection.set('connected')
}

const tastytradeDisconnect = async () => {
	tastytradeConnection.set('not connected')
}

export const setAPIURL = (url: string) => {
	APIURL = url
}

interface Response {
	data: any
	status: number
}

export const apiRequest = async (method: string, url: string, data?: any, headers?: Record<string, string>): Promise<Response> => {
	if (!headers) {
		headers = {}
	}
	headers['Accept'] = 'application/json'

	if (token) {
		headers['Authorization'] = token
	}

	if (method == 'post' || method == 'put') {
		headers['Content-Type'] = 'application/json;charset=UTF-8'
	}

	const response = await fetch(APIURL + url, {
		method: method, // *GET, POST, PUT, DELETE, etc.
		mode: 'cors', // no-cors, *cors, same-origin
		cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
		credentials: 'omit', // include, *same-origin, omit
		headers: headers,
		redirect: 'follow', // manual, *follow, error
		referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
		body: JSON.stringify(data), // body data type must match "Content-Type" header
	})

	return {
		data: await response.json(),
		status: response.status,
	}
}

const completeLogin = async () => {
	tastytradeSession.set('valid')
	dxfeedConnect()
	tastytradeConnect()
}

export const login = async (username: string, password: string): Promise<boolean> => {
	try {
		let resp = await apiRequest('post', '/sessions', { login: username, password: password })
		if (!('session-token' in resp.data['data'])) {
			return false
		}
		token = resp.data['data']['session-token']
		Cookies.set('tastytrade_token', token)
		Cookies.set('tastytrade_tokenDateTime', new Date().toISOString())
		completeLogin()
		return true
	} catch { }

	return false
}

export const logout = async () => {
	try {
		Cookies.remove('tastytrade_token')
		Cookies.remove('tastytrade_tokenDateTime')
		tastytradeSession.set('invalid')
		dxfeedDisconnect()
		tastytradeDisconnect()
		await apiRequest('delete', '/sessions')
		return true
	} catch {
		return false
	}
}

export const checkSession = async () => {
	if (Cookies.get('tastytrade_token')) {
		token = Cookies.get('tastytrade_token') as string
	}
	if (!token) {
		tastytradeSession.set('invalid')
		return false
	}

	if (Cookies.get('tastytrade_tokenDateTime')) {
		if (Cookies.get('tastytrade_tokenDateTime')) {
			let tokenDateTime = new Date(Cookies.get('tastytrade_tokenDateTime') as string)
			let diff = (new Date().getTime() - tokenDateTime.getTime()) / 1000
			if (diff >= 86400) {
				tastytradeSession.set('invalid')
				return false
			}
		}
	}

	let resp = await apiRequest('post', '/sessions/validate')
	if (resp.status == 201) {
		completeLogin()
		return true
	}

	token = ''
	tastytradeSession.set('invalid')
	Cookies.remove('tastytrade_token')
	Cookies.remove('tastytrade_tokenDateTime')
	return false
}

export const getMarketDataStreamer = async () => {
	// @ts-ignore
	let response: {
		data: {
			token: string
			'streamer-url': string
			'websocket-url': string
			level: string
		}
		context: string
	} = {}

	try {
		response = (await apiRequest('get', '/quote-streamer-tokens')).data
		response.data['websocket-url'] = response.data['websocket-url'].replace('https', 'wss') + '/cometd'

		return response
	} catch { }
}

export interface StrikeData {
	'strike-price': string
	call: string
	'call-streamer-symbol': string
	put: string
	'put-streamer-symbol': string
}

export interface EquityOptionChainExpiration {
	'expiration-type': string
	'expiration-date': string
	'days-to-expiration': number
	'settlement-type': string
	strikes: StrikeData[]
}

export interface EquityOptionChain {
	'underlying-symbol': string
	'root-symbol': string
	'option-chain-type': string
	'shares-per-contract': number
	'tick-sizes': {
		value: string
		threshold?: string
	}[]
	expirations: EquityOptionChainExpiration[]
}

export const getEquityOptionChains = async (symbol: string) => {
	// @ts-ignore
	let response: {
		data: {
			items: EquityOptionChain[]
			context: string
		}
	} = {}

	symbol = symbol.toUpperCase()
	try {
		response = (await apiRequest('get', `/option-chains/${encodeURIComponent(symbol)}/nested`)).data
		if (response.data.items.length == 1) {
			return response.data.items[0]
		} else if (response.data.items.length > 1) {
			if (response.data.items[0]['root-symbol'] == 'SPXW') {
				return response.data.items[0]
			} else if (response.data.items[1]['root-symbol'] == 'SPXW') {
				return response.data.items[1]
			} else {
				return response.data.items[0]
			}
		}
	} catch { }
}

export interface FuturesContract {
	symbol: string
	'root-symbol': string
	'expiration-date': string
	'days-to-expiration': number
	'active-month': boolean
	'next-active-month': boolean
	'stops-trading-at': string
	'expires-at': string
}

export interface FuturesOptionChainExpiration {
	'underlying-symbol': string
	'root-symbol': string
	'option-root-symbol': string
	'option-contract-symbol': string
	asset: string
	'expiration-date': string
	'days-to-expiration': number
	'expiration-type': string
	'settlement-type': string
	'notional-value': string
	'display-factor': string
	'strike-factor': string
	'stops-trading-at': string
	'expires-at': string
	'tick-sizes': {
		value: string
		threshold?: string
	}[]
	strikes: StrikeData[]
}

export interface FuturesOptionChain {
	'underlying-symbol': string
	'root-symbol': string
	'exercise-style': string
	expirations: FuturesOptionChainExpiration[]
}

export const getFuturesOptionChains = async (symbol: string) => {
	// @ts-ignore
	let response: {
		data: {
			futures: FuturesContract[]
			'option-chains': FuturesOptionChain
			context: string
		}
	} = {}

	symbol = symbol.toUpperCase()
	try {
		response = (await apiRequest('get', `/futures-option-chains/${encodeURIComponent(symbol)}/nested`)).data
		return { futures: response.data.futures, 'option-chains': response.data['option-chains'] }
	} catch { }
}

export const getAccounts = async () => {
	let resp = await apiRequest('GET', '/customers/me/accounts')
	let accounts: string[] = []
	for (const item of resp.data['data']['items']) {
		accounts.push(item['account']['account-number'])
	}
	return accounts
}

export interface EquitiesMarketTime {
	state: string
	'instrument-collection': string
	'next-session': {
		'instrument-collection': string
		'session-date': string
		'open-at': string
		'close-at': string
		'start-at': string
		'close-at-ext': string
	}
	'previous-session': {
		'instrument-collection': string
		'session-date': string
		'open-at': string
		'close-at': string
		'start-at': string
		'close-at-ext': string
	}
}

let equitiesMarketTime: EquitiesMarketTime

export const getEquitiesMarketTime = async (forceLoad = false) => {
	if (equitiesMarketTime && !forceLoad) {
		return equitiesMarketTime
	}

	let resp: {
		data: {
			data: EquitiesMarketTime
			context: string
		}
	}

	resp = await apiRequest('GET', '/market-time/equities/sessions/current')
	equitiesMarketTime = resp.data.data
	return equitiesMarketTime
}

export interface FuturesMarketTime {
	state: string
	'instrument-collection': string
	'next-session': {
		'instrument-collection': string
		'session-date': string
		'open-at': string
		'close-at': string
		'start-at': string
	}
	'previous-session': {
		'instrument-collection': string
		'session-date': string
		'open-at': string
		'close-at': string
		'start-at': string
	}
}

let futuresMarketTime: FuturesMarketTime[]

export const getFuturesMarketTime = async (forceLoad = false) => {
	if (futuresMarketTime && !forceLoad) {
		return futuresMarketTime
	}

	let resp: {
		data: {
			data: {
				items: FuturesMarketTime[]
			}
			context: string
		}
	}

	resp = await apiRequest('GET', '/market-time/futures/sessions/current')
	futuresMarketTime = resp.data.data.items
	return futuresMarketTime
}

export const tastytradeEncodeOptionsSymbol = (symbol: string, expiration: string, side: OptionSide, strike: string): string => {
	let s: string = ''

	symbol = symbol.toUpperCase()
	if (symbol == 'SPX') {
		symbol = 'SPXW'
	}
	while (symbol.length < 6) {
		symbol += ' '
	}
	s += symbol
	s += expiration.substring(2, 4) + expiration.substring(5, 7) + expiration.substring(8, 10)
	if (side == 'call') {
		s += 'C'
	} else if (side == 'put') {
		s += 'P'
	}

	strike = strike.replace('.00', '00')
	strike = strike.replace('.0', '00')
	strike += '0'
	while (strike.length < 8) {
		strike = '0' + strike
	}

	s += strike

	return s
}

export const tastytradeDecodeOptionsSymbol = (symbol: string): Instrument => {
	if (symbol[0] == '.') {
		// futures option
		// find 'C' or 'P' in the symbol; the value after that is the strike price, the value before that until the first space is the expiration date
		let s = symbol.split(' ')
		let lastString = s[s.length - 1]
		let side: OptionSide
		let sideIndex = lastString.indexOf('C')
		if (sideIndex >= 0) {
			side = OptionSide.call
		} else {
			sideIndex = lastString.indexOf('P')
			side = OptionSide.put
		}
		let strike = parseFloat(lastString.substring(sideIndex + 1))
		let expiration = lastString.substring(0, sideIndex)
		let firstString = symbol.substring(2, symbol.indexOf(expiration) - 1)
		let futureOptionContractCode = firstString.substring(firstString.length - 5)
		let futureContractCode = firstString.substring(0, firstString.length - 5)
		let asset = futureContractCode.substring(0, futureContractCode.length - 2)
		expiration = '20' + expiration.substring(0, 2) + '-' + expiration.substring(2, 4) + '-' + expiration.substring(4, 6)
		// console.log({ asset, side, strike, expiration, futureContractCode, futureOptionContractCode })
		return { type: InstrumentType['Future Option'], asset, expiration, side, strike, tastytradeSymbol: symbol, dxfeedSymbol: dxFeedEncodeOptionsSymbol(asset, expiration, side, strike), futureContractCode, futureOptionContractCode }
	} else if (symbol[0] == '/') {
		// futures
		return { type: InstrumentType.Future, asset: symbol.substring(1) }
	} else if (symbol.length == 21) {
		let asset: string
		let expiration: string
		let side: OptionSide
		let strike: number

		asset = symbol.substring(0, 6).trim()
		if (asset == 'SPXW') {
			asset = 'SPX'
		}

		expiration = '20' + symbol.substring(6, 8) + '-' + symbol.substring(8, 10) + '-' + symbol.substring(10, 12)

		if (symbol[12] == 'C') {
			side = OptionSide.call
		} else {
			side = OptionSide.put
		}

		strike = Math.round((parseFloat(symbol.substring(13)) / 1000) * 100) / 100
		return { type: InstrumentType['Equity Option'], asset, expiration, side, strike, tastytradeSymbol: symbol, dxfeedSymbol: dxFeedEncodeOptionsSymbol(asset, expiration, side, strike) }
	} else {
		return { type: InstrumentType.Equity, asset: symbol }
	}
}

let riskFreeRate: number

export const getRiskFreeRate = async () => {
	if (riskFreeRate) {
		return riskFreeRate
	}

	let resp: {
		data: {
			data: {
				'risk-free-rate': string
			}
			context: string
		}
	}

	resp = await apiRequest('GET', '/margin-requirements-public-configuration')
	riskFreeRate = parseFloat(resp.data.data['risk-free-rate'])
	return riskFreeRate
}



export enum InstrumentType {
	'Cryptocurrency' = 'Cryptocurrency',
	'Equity' = 'Equity',
	'Equity Offering' = 'Equity Offering',
	'Equity Option' = 'Equity Option',
	'Future' = 'Future',
	'Future Option' = 'Future Option',
}

export interface Position {
	'account-number': string
	'average-daily-market-close-price': number
	'average-open-price': number
	'average-yearly-market-close-price': number
	'close-price': number
	'cost-effect': PriceEffect
	'created-at': string
	'deliverable-type': string
	'expires-at': string
	'fixing-price': number
	'instrument-type': InstrumentType
	'is-frozen': boolean
	'is-suppressed': boolean
	'mark-price': number
	mark: number
	multiplier: number
	'order-id': number
	'quantity realized-day-gain-date': string
	'quantity-direction': 'Long' | 'Short'
	quantity: number
	'realized-day-gain-effect': string
	'realized-day-gain': number
	'realized-today-date': string
	'realized-today-effect': string
	'realized-today': number
	'restricted-quantity': number
	symbol: string
	'underlying-symbol': string
	'updated-at': string
	// added
	instrument: Instrument
}

export const getPositions = async (accountNumber: string) => {
	let resp: {
		data: {
			data: {
				items: Position[]
			}
			context: string
		}
	}

	resp = await apiRequest('GET', `/accounts/${accountNumber}/positions`)
	return resp.data.data.items
}

export const getMarginRequirements = async (accountNumber: string) => {
	let resp: {
		data: {
			data: {
				groups: {
					'underlying-symbol': string
					'maintenance-requirement': string
				}[]
			}
		}
	}

	resp = await apiRequest('GET', `/margin/accounts/${accountNumber}/requirements`)
	return resp.data.data.groups
}