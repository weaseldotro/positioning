import type { InstrumentType } from './tastytrade'

export enum OptionSide {
	call = 'call',
	put = 'put',
}

export enum PriceEffect {
	Debit = 'Debit',
	Credit = 'Credit',
}

export interface Trade {
	Symbol: string
	Price: number
	DateTime: number
}

export interface Quote {
	bid: number
	ask: number
}

export interface Greeks {
	side: OptionSide
	strike: string
	delta: number
	theta: number
	gamma: number
	vega: number
}

export interface Instrument {
	type: InstrumentType
	asset: string
	expiration?: string
	side?: OptionSide
	strike?: number
	dxfeedSymbol?: string
	tastytradeSymbol?: string
	futureContractCode?: string
	futureOptionContractCode?: string
}
