import { get, writable } from 'svelte/store'
import { tastytradeDecodeOptionsSymbol, type Position, tastytradeAccount, getPositions, getMarginRequirements } from './tastytrade'

export interface PositionWithBidAsk extends Position {
	bid: number
	ask: number
	iv: number
	delta: number
	gamma: number
	theta: number
	vega: number
	theo: number
	extrinsic: number
	intrinsic: number
}

export const tastytradePositions = writable<(PositionWithBidAsk)[]>([])
export const instruments = writable<string[]>([])

let maintenanceBuyingPower: Record<string, number> = {}

export const loadPositions = async () => {
	tastytradePositions.set([])

	try {
		let newPositions = await getPositions(get(tastytradeAccount))
		for (const i in newPositions) {
			newPositions[i].instrument = tastytradeDecodeOptionsSymbol(newPositions[i].symbol)
			// console.log('position', positions[i])
		}
		// @ts-ignore
		tastytradePositions.set(newPositions)

		let newInstruments: string[] = []
		newPositions.forEach((position) => {
			if (position['instrument-type'] != 'Equity Option' && position['instrument-type'] != 'Future Option') {
				return
			}

			if (!newInstruments.includes(position['underlying-symbol'])) {
				newInstruments.push(position['underlying-symbol'])
			}
		})

		if (newInstruments.length > 0) {
			newInstruments.sort((a, b) => {
				return a < b ? -1 : 1
			})
			instruments.set(newInstruments)
		}
	} catch { }

	try {
		let marginRequirements = await getMarginRequirements(get(tastytradeAccount))
		marginRequirements.forEach((marginRequirement) => {
			maintenanceBuyingPower[marginRequirement['underlying-symbol']] = parseFloat(marginRequirement['maintenance-requirement'])
		})
	} catch { }
}

export const getMaintenanceBuyingPower = (symbol: string) => {
	return maintenanceBuyingPower[symbol]
}
