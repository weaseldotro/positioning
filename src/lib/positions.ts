import { get, writable } from 'svelte/store'
import { tastytradeDecodeOptionsSymbol, type Position, tastytradeAccount, getPositions } from './tastytrade'

export const tastytradePositions = writable<(Position & {bid?: number, ask?: number, iv?: number, delta?: number, theo?: number})[]>([])
export const instruments = writable<string[]>([])

export const loadPositions = async () => {
	tastytradePositions.set([])

	try {
		let newPositions = await getPositions(get(tastytradeAccount))
		for (const i in newPositions) {
			newPositions[i].instrument = tastytradeDecodeOptionsSymbol(newPositions[i].symbol)
			// console.log('position', positions[i])
		}
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
}
