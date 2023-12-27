import { get } from 'svelte/store'
import { tastytradePositions } from './positions'
import { OptionSide, type Instrument } from './types'
import { tastytradeDecodeOptionsSymbol } from './tastytrade'

export type MaintenanceBuyingPower = Record<string, { calls: number; puts: number }>

interface MaintenanceBuyingPowerCalculation {
	expiration: string
	calls: number
	puts: number
	shortCalls: Record<string, number>
	longCalls: Record<string, number>
	shortPuts: Record<string, number>
	longPuts: Record<string, number>
}

const equityOptionsNakedShortOptionMarginRequirement = 0.2

export const calculateEquityOptionsMaintenanceBuyingPower = (underlyingInstrument: string, multiplier: number): MaintenanceBuyingPower => {
	let bps: MaintenanceBuyingPowerCalculation[] = []
	let result: MaintenanceBuyingPower = {}
	get(tastytradePositions).forEach((position) => {
		// console.log('instrument', position.instrument, 'underlying', position["underlying-symbol"], 'underlying needed', underlyingInstrument)
		if (position['underlying-symbol'] != underlyingInstrument) {
			return
		}

		let index = -1
		for (let [i, bp] of Object.entries(bps)) {
			if (bp.expiration == position.instrument.expiration) {
				index = parseInt(i)
				break
			}
		}

		if (index == -1) {
			bps.push({
				expiration: position.instrument.expiration as string,
				calls: 0,
				puts: 0,
				shortCalls: {},
				longCalls: {},
				shortPuts: {},
				longPuts: {},
			})
			index = bps.length - 1
		}

		if (position.instrument.side == OptionSide.call) {
			if (position['quantity-direction'] == 'Short') {
				if (!(position.symbol in bps[index].shortCalls)) {
					bps[index].shortCalls[position.symbol] = 0
				}
				bps[index].shortCalls[position.symbol] += position.quantity
			} else if (position['quantity-direction'] == 'Long') {
				if (!(position.symbol in bps[index].longCalls)) {
					bps[index].longCalls[position.symbol] = 0
				}
				bps[index].longCalls[position.symbol] += position.quantity
			}
		} else if (position.instrument.side == OptionSide.put) {
			if (position['quantity-direction'] == 'Short') {
				if (!(position.symbol in bps[index].shortPuts)) {
					bps[index].shortPuts[position.symbol] = 0
				}
				bps[index].shortPuts[position.symbol] += position.quantity
			} else if (position['quantity-direction'] == 'Long') {
				if (!(position.symbol in bps[index].longPuts)) {
					bps[index].longPuts[position.symbol] = 0
				}
				bps[index].longPuts[position.symbol] += position.quantity
			}
		}
	})

	for (let i in bps) {
		let bp = bps[i]
		let shortCalls: string[] = []
		let longCalls: string[] = []

		for (let instrument in bp.shortCalls) {
			shortCalls.push(instrument)
		}
		shortCalls.sort((a, b) => {
			let instrumentA = tastytradeDecodeOptionsSymbol(a)
			let instrumentB = tastytradeDecodeOptionsSymbol(b)
			return (instrumentA.strike as number) - (instrumentB.strike as number)
		})

		for (let instrument in bp.longCalls) {
			longCalls.push(instrument)
		}
		longCalls.sort((a, b) => {
			let instrumentA = tastytradeDecodeOptionsSymbol(a)
			let instrumentB = tastytradeDecodeOptionsSymbol(b)
			return (instrumentA.strike as number) - (instrumentB.strike as number)
		})

		bp.calls = 0
		for (let shortCall of shortCalls) {
			for (let i = 0; i < bp.shortCalls[shortCall]; i++) {
				// try to find a long
				let foundLongCall: string = ''
				for (let longCall of longCalls) {
					if (bp.longCalls[longCall] == 0) {
						continue
					}
					bp.longCalls[longCall]--
					foundLongCall = longCall
					break
				}

				if (!foundLongCall) {
					// naked short call
					bp.calls += (tastytradeDecodeOptionsSymbol(shortCall).strike as number) * equityOptionsNakedShortOptionMarginRequirement
				} else {
					// spread
					bp.calls += (tastytradeDecodeOptionsSymbol(foundLongCall).strike as number) - (tastytradeDecodeOptionsSymbol(shortCall).strike as number)
				}
			}
		}
		bp.calls *= multiplier

		let shortPuts: string[] = []
		let longPuts: string[] = []
		for (let instrument in bp.shortPuts) {
			shortPuts.push(instrument)
		}
		shortPuts.sort((a, b) => {
			let instrumentA = tastytradeDecodeOptionsSymbol(a)
			let instrumentB = tastytradeDecodeOptionsSymbol(b)
			return (instrumentB.strike as number) - (instrumentA.strike as number)
		})

		for (let instrument in bp.longPuts) {
			longPuts.push(instrument)
		}
		longPuts.sort((a, b) => {
			let instrumentA = tastytradeDecodeOptionsSymbol(a)
			let instrumentB = tastytradeDecodeOptionsSymbol(b)
			return (instrumentB.strike as number) - (instrumentA.strike as number)
		})

		bp.puts = 0
		for (let shortPut of shortPuts) {
			for (let i = 0; i < bp.shortPuts[shortPut]; i++) {
				// try to find a long
				let foundLongPut: string = ''
				for (let longPut of longPuts) {
					if (bp.longPuts[longPut] == 0) {
						continue
					}
					bp.longPuts[longPut]--
					foundLongPut = longPut
					break
				}

				if (!foundLongPut) {
					// naked short put
					bp.puts += (tastytradeDecodeOptionsSymbol(shortPut).strike as number) * equityOptionsNakedShortOptionMarginRequirement
				} else {
					// spread
					bp.puts += (tastytradeDecodeOptionsSymbol(shortPut).strike as number) - (tastytradeDecodeOptionsSymbol(foundLongPut).strike as number)
				}
			}
		}

		bp.puts *= multiplier

		result[bp.expiration] = { calls: bp.calls, puts: bp.puts }
	}

	return result
}

export interface Quantity {
	shortCallsQty: number
	longCallsQty: number
	shortPutsQty: number
	longPutsQty: number
}

export type Quantities = Record<string, Quantity>

export const calculateQuantities = (underlyingInstrument: string): Quantities => {
	let quantities: Quantities = {}
	get(tastytradePositions).forEach((position) => {
		if (position['underlying-symbol'] != underlyingInstrument) {
			return
		}

		if (!((position.instrument.expiration as string) in quantities)) {
			quantities[position.instrument.expiration as string] = {
				shortCallsQty: 0,
				longCallsQty: 0,
				shortPutsQty: 0,
				longPutsQty: 0,
			}
		}

		if (position.instrument.side == OptionSide.call) {
			if (position['quantity-direction'] == 'Short') {
				quantities[position.instrument.expiration as string].shortCallsQty += position.quantity
			} else if (position['quantity-direction'] == 'Long') {
				quantities[position.instrument.expiration as string].longCallsQty += position.quantity
			}
		} else if (position.instrument.side == OptionSide.put) {
			if (position['quantity-direction'] == 'Short') {
				quantities[position.instrument.expiration as string].shortPutsQty += position.quantity
			} else if (position['quantity-direction'] == 'Long') {
				quantities[position.instrument.expiration as string].longPutsQty += position.quantity
			}
		}
	})

	return quantities
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export const calculateDTE = (date: string) => {
	return Math.floor(Math.abs((new Date(date + 'T21:00:00Z')).getTime() - (new Date()).getTime()) / MS_PER_DAY);
}