<script lang="ts">
	import { blackScholes, getDelta, getImpliedVolatility } from '$lib/black-scholes'
	import { calculateDTE, calculateEquityOptionsMaintenanceBuyingPower, calculateQuantities, type MaintenanceBuyingPower, type Quantities, type Quantity } from '$lib/calculate'
	import { trades } from '$lib/market'
	import { roundNumber } from '$lib/math'
	import { tastytradePositions, type PositionWithBidAsk } from '$lib/positions'
	import { Badge, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte'
	import KeyValue from './KeyValue.svelte'

	export let instrument: string

	const tdClass = 'px-6 py-1 whitespace-nowrap font-medium text-center text-black'

	let expirations: string[] = []
	let maintenanceBuyingPower: MaintenanceBuyingPower = {}
	let callsMaintenanceBuyingPower = 0
	let putsMaintenanceBuyingPower = 0
	let quantities: Quantities = {}
	let totalQuantity: Quantity = {
		shortCalls: 0,
		longCalls: 0,
		shortPuts: 0,
		longPuts: 0,
	}
	let updateInterval: number

	let callPositions: PositionWithBidAsk[] = []
	let putPositions: PositionWithBidAsk[] = []

	const updateInstrument = () => {
		let newExpirations: string[] = []
		let multiplier = 0
		callsMaintenanceBuyingPower = 0
		putsMaintenanceBuyingPower = 0
		totalQuantity = {
			shortCalls: 0,
			longCalls: 0,
			shortPuts: 0,
			longPuts: 0,
		}

		$tastytradePositions.forEach((position) => {
			if (position['underlying-symbol'] != instrument) {
				return
			}
			multiplier = position.multiplier

			if (!newExpirations.includes(position.instrument.expiration as string)) {
				newExpirations.push(position.instrument.expiration as string)
			}

			if (position.instrument.side == 'call') {
				callPositions.push(position)
			} else {
				putPositions.push(position)
			}
		})

		// sort call and put positions using the delta
		callPositions.sort((a, b) => {
			return (b.delta as number) - (a.delta as number)
		})
		putPositions.sort((a, b) => {
			return (a.delta as number) - (b.delta as number)
		})

		maintenanceBuyingPower = {}
		if (instrument[0] != '/') {
			maintenanceBuyingPower = calculateEquityOptionsMaintenanceBuyingPower(instrument, multiplier)
			// console.log({ maintenanceBuyingPower })
			for (let bp of Object.values(maintenanceBuyingPower)) {
				callsMaintenanceBuyingPower += bp.calls
				putsMaintenanceBuyingPower += bp.puts
			}
		}

		quantities = calculateQuantities(instrument)
		Object.values(quantities).forEach((quantity) => {
			totalQuantity.shortCalls += quantity.shortCalls
			totalQuantity.longCalls += quantity.longCalls
			totalQuantity.shortPuts += quantity.shortPuts
			totalQuantity.longPuts += quantity.longPuts
		})

		if (newExpirations.length > 0) {
			newExpirations.sort((a, b) => {
				return a < b ? -1 : 1
			})

			expirations = newExpirations
		}

		if (updateInterval) {
			clearInterval(updateInterval)
		}

		setInterval(updateGreeks, 1000)
	}

	interface Totals {
		shortCallsDeltas: number
		longCallsDeltas: number
		shortPutsDeltas: number
		longPutsDeltas: number
		netDelta: number
		totalDeltas: number
		imbalance: number
	}

	let deltas: Record<string, Totals> = {}
	let totals: Totals = {
		shortCallsDeltas: 0,
		longCallsDeltas: 0,
		shortPutsDeltas: 0,
		longPutsDeltas: 0,
		netDelta: 0,
		totalDeltas: 0,
		imbalance: 0,
	}

	const updateGreeks = () => {
		$tastytradePositions.forEach((position, i) => {
			if (position['underlying-symbol'] != instrument) {
				return
			}
			// console.log('instrument', instrument, 'bid', position.bid, 'ask', position.ask)

			if (position.bid && position.ask) {
				let timeToExpiration = (new Date(position['expires-at']).getTime() - new Date().getTime()) / 31536000000
				let price = $trades[position.instrument.asset]
				let iv = getImpliedVolatility((position.bid + position.ask) / 2, price, position.instrument.strike as number, timeToExpiration, 0, position.instrument.side as string, 0.0001)
				$tastytradePositions[i].iv = iv
				$tastytradePositions[i].delta = getDelta(price, position.instrument.strike as number, timeToExpiration, iv, 0, position.instrument.side as string)
				$tastytradePositions[i].theo = blackScholes(price, position.instrument.strike as number, timeToExpiration, iv, 0, position.instrument.side as string)

				if (position.instrument.side == 'call') {
					for (let j = 0; j < callPositions.length; j++) {
						if (callPositions[j].instrument.dxfeedSymbol == position.instrument.dxfeedSymbol) {
							callPositions[j].iv = iv
							callPositions[j].delta = $tastytradePositions[i].delta
							callPositions[j].theo = $tastytradePositions[i].theo
							break
						}
					}
				} else {
					for (let j = 0; j < putPositions.length; j++) {
						if (putPositions[j].instrument.dxfeedSymbol == position.instrument.dxfeedSymbol) {
							putPositions[j].iv = iv
							putPositions[j].delta = $tastytradePositions[i].delta
							putPositions[j].theo = $tastytradePositions[i].theo
							break
						}
					}
				}
			}
		})

		// sum up all the deltas for each expiration
		deltas = {}
		$tastytradePositions.forEach((position) => {
			if (position['underlying-symbol'] != instrument) {
				return
			}

			let expiration = position.instrument.expiration as string
			if (!(expiration in deltas)) {
				deltas[expiration] = {
					shortCallsDeltas: 0,
					longCallsDeltas: 0,
					shortPutsDeltas: 0,
					longPutsDeltas: 0,
					netDelta: 0,
					totalDeltas: 0,
					imbalance: 0,
				}
			}

			if (position.instrument.side == 'call') {
				if (position['quantity-direction'] == 'Long') {
					deltas[expiration].longCallsDeltas += (position.delta as number) * position.quantity
				} else {
					deltas[expiration].shortCallsDeltas += (position.delta as number) * -position.quantity
				}
			} else {
				if (position['quantity-direction'] == 'Long') {
					deltas[expiration].longPutsDeltas += (position.delta as number) * position.quantity
				} else {
					deltas[expiration].shortPutsDeltas += (position.delta as number) * -position.quantity
				}
			}

			deltas[expiration].netDelta = deltas[expiration].shortCallsDeltas + deltas[expiration].longCallsDeltas + deltas[expiration].shortPutsDeltas + deltas[expiration].longPutsDeltas
			deltas[expiration].totalDeltas = Math.abs(deltas[expiration].shortCallsDeltas + deltas[expiration].longCallsDeltas) + Math.abs(deltas[expiration].shortPutsDeltas + deltas[expiration].longPutsDeltas)
			deltas[expiration].imbalance = roundNumber((deltas[expiration].netDelta / deltas[expiration].totalDeltas) * 100)
		})

		// multiply deltas by 100 and round
		Object.values(deltas).forEach((d) => {
			d.shortCallsDeltas = roundNumber(d.shortCallsDeltas * 100)
			d.longCallsDeltas = roundNumber(d.longCallsDeltas * 100)
			d.shortPutsDeltas = roundNumber(d.shortPutsDeltas * 100)
			d.longPutsDeltas = roundNumber(d.longPutsDeltas * 100)
		})

		// sum up all the deltas for all expirations
		totals = {
			shortCallsDeltas: 0,
			longCallsDeltas: 0,
			shortPutsDeltas: 0,
			longPutsDeltas: 0,
			netDelta: 0,
			totalDeltas: 0,
			imbalance: 0,
		}
		Object.values(deltas).forEach((d) => {
			totals.shortCallsDeltas += d.shortCallsDeltas
			totals.longCallsDeltas += d.longCallsDeltas
			totals.shortPutsDeltas += d.shortPutsDeltas
			totals.longPutsDeltas += d.longPutsDeltas
		})

		totals.shortCallsDeltas = roundNumber(totals.shortCallsDeltas)
		totals.longCallsDeltas = roundNumber(totals.longCallsDeltas)
		totals.shortPutsDeltas = roundNumber(totals.shortPutsDeltas)
		totals.longPutsDeltas = roundNumber(totals.longPutsDeltas)
		totals.netDelta = roundNumber(totals.shortCallsDeltas + totals.longCallsDeltas + totals.shortPutsDeltas + totals.longPutsDeltas)
		totals.totalDeltas = roundNumber(Math.abs(totals.shortCallsDeltas + totals.longCallsDeltas) + Math.abs(totals.shortPutsDeltas + totals.longPutsDeltas))
		totals.imbalance = roundNumber((totals.netDelta / totals.totalDeltas) * 100)
	}

	$: if (instrument) {
		updateInstrument()
	}
</script>

<div class="flex flex-wrap gap-3 justify-start items-start">
	<div class="w-full max-w-xl p-2 border border-green-400 mb-3">
		<h2 class="p-2 bg-green-200 mb-2 font-semibold -mt-2 -mx-2 text-center">
			{instrument}
			{#if $trades && $trades[instrument]}
				${$trades[instrument]}{/if}
		</h2>

		<div class="grid md:grid-cols-2 gap-x-3">
			<div>
				<KeyValue key="Net delta" value={totals.netDelta} />
			</div>
			<div>
				<KeyValue key="Imbalance" value={totals.imbalance + '%'} />
			</div>

			<div>
				<KeyValue key="Call deltas" value={roundNumber(totals.shortCallsDeltas + totals.longCallsDeltas)} />
				<KeyValue key="Short call deltas" value={totals.shortCallsDeltas} />
				<KeyValue key="Long call deltas" value={totals.longCallsDeltas} />
				<KeyValue key="Number of short calls" value={totalQuantity.shortCalls} />
				<KeyValue key="Number of long calls" value={totalQuantity.longCalls} />
				{#if callsMaintenanceBuyingPower}
					<KeyValue key="Total calls BPR" value={callsMaintenanceBuyingPower} />
				{/if}
				<!-- {#if callsMaintenanceBuyingPower && totalQuantity.shortCalls}
					<KeyValue key="Average BPR / short call" value={Math.round(callsMaintenanceBuyingPower / totalQuantity.shortCalls)} />
				{/if} -->
			</div>

			<div>
				<KeyValue key="Put deltas" value={roundNumber(totals.shortPutsDeltas + totals.longPutsDeltas)} />
				<KeyValue key="Short put deltas" value={totals.shortPutsDeltas} />
				<KeyValue key="Long put deltas" value={totals.longPutsDeltas} />

				<KeyValue key="Number of short puts" value={totalQuantity.shortPuts} />
				<KeyValue key="Number of long puts" value={totalQuantity.longPuts} />
				{#if putsMaintenanceBuyingPower}
					<KeyValue key="Total puts BPR" value={putsMaintenanceBuyingPower} />
				{/if}
				<!-- {#if putsMaintenanceBuyingPower && totalQuantity.shortPuts}
					<KeyValue key="Average BPR / short put" value={Math.round(putsMaintenanceBuyingPower / totalQuantity.shortPuts)} />
				{/if} -->
			</div>
		</div>
	</div>

	{#each expirations as expiration}
		<div class="w-full max-w-xl p-2 border border-blue-400">
			<h2 class="p-2 bg-blue-100 mb-2 font-semibold -mt-2 -mx-2 text-center">
				{instrument}
				{expiration} expiration ({calculateDTE(expiration)} DTE)
			</h2>

			<div class="grid md:grid-cols-2 gap-x-3">
				{#if expiration in deltas}
					<div>
						<KeyValue key="Net delta" value={roundNumber(deltas[expiration].shortCallsDeltas + deltas[expiration].longCallsDeltas + deltas[expiration].shortPutsDeltas + deltas[expiration].longPutsDeltas)} />
					</div>
					<div>
						<KeyValue key="Imbalance" value={deltas[expiration].imbalance + '%'} />
					</div>
				{/if}

				<div>
					{#if expiration in deltas}
						<KeyValue key="Call deltas" value={roundNumber(deltas[expiration].shortCallsDeltas + deltas[expiration].longCallsDeltas)} />
						<KeyValue key="Short call deltas" value={deltas[expiration].shortCallsDeltas} />
						<KeyValue key="Long call deltas" value={deltas[expiration].longCallsDeltas} />
					{/if}

					{#if expiration in quantities}
						<KeyValue key="Number of short calls" value={quantities[expiration].shortCalls} />
						<KeyValue key="Number of long calls" value={quantities[expiration].longCalls} />
					{/if}

					{#if expiration in maintenanceBuyingPower}
						<KeyValue key="Total calls BPR" value={maintenanceBuyingPower[expiration].calls} />
					{/if}

					<!-- {#if expiration in maintenanceBuyingPower && quantities[expiration].shortCalls}
						<KeyValue key="Average BPR / short call" value={Math.round(maintenanceBuyingPower[expiration].calls / quantities[expiration].shortCalls)} />
					{/if} -->
				</div>

				<div>
					{#if expiration in deltas}
						<KeyValue key="Put deltas" value={roundNumber(deltas[expiration].shortPutsDeltas + deltas[expiration].longPutsDeltas)} />
						<KeyValue key="Short put deltas" value={deltas[expiration].shortPutsDeltas} />
						<KeyValue key="Long put deltas" value={deltas[expiration].longPutsDeltas} />
					{/if}

					{#if expiration in quantities}
						<KeyValue key="Number of short puts" value={quantities[expiration].shortPuts} />
						<KeyValue key="Number of long puts" value={quantities[expiration].longPuts} />
					{/if}

					{#if expiration in maintenanceBuyingPower}
						<KeyValue key="Total puts BPR" value={maintenanceBuyingPower[expiration].puts} />
					{/if}

					<!-- {#if expiration in maintenanceBuyingPower && quantities[expiration].shortPuts}
						<KeyValue key="Average BPR / short put" value={Math.round(maintenanceBuyingPower[expiration].puts / quantities[expiration].shortPuts)} />
					{/if} -->
				</div>
			</div>
		</div>
	{/each}
</div>

<div class="grid xl:grid-cols-2 gap-2 mt-2">
	<div>
		<h2 class="text-lg font-semibold mb-1">{instrument} Calls</h2>
		<Table class="border w-full max-w-4xl" hoverable>
			<TableHead class="bg-slate-200">
				<TableHeadCell class={`${tdClass} w-40`}>Expiration</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>Strike</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>Quantity</TableHeadCell>
				<TableHeadCell class={tdClass}>Delta</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>Net delta</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>IV</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>Theo price</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each callPositions as position}
					<TableBodyRow>
						<TableBodyCell {tdClass} >
							<span>{position.instrument.expiration ? calculateDTE(position.instrument.expiration) : ''} DTE</span>
						</TableBodyCell>
						<TableBodyCell {tdClass} >
							<span>{position.instrument.strike}</span>
						</TableBodyCell>
						<TableBodyCell {tdClass} >
							<Badge class="ml-2" border large color={position['quantity-direction'] == 'Long' ? 'green' : 'red'}
								>{#if position['quantity-direction'] == 'Long'}+{:else}-{/if}{position.quantity}
							</Badge>
						</TableBodyCell>
						<TableBodyCell {tdClass} >{position.delta ? (position.delta * 100).toFixed(2) : ''}</TableBodyCell>
						<TableBodyCell {tdClass} >{position.delta ? (position.quantity * position.delta * 100 * (position['quantity-direction'] == 'Short' ? -1 : 1)).toFixed(2) : ''}</TableBodyCell>
						<TableBodyCell {tdClass} >{position.iv ? (position.iv * 100).toFixed(2) : ''}</TableBodyCell>
						<TableBodyCell {tdClass} >{position.theo ? position.theo.toFixed(2) : ''}</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</div>

	<div>
		<h2 class="text-lg font-semibold mb-1">{instrument} Puts</h2>
		<Table class="border w-full max-w-4xl" hoverable>
			<TableHead class="bg-slate-200">
				<TableHeadCell class={`${tdClass} w-40`}>Expiration</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>Strike</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>Quantity</TableHeadCell>
				<TableHeadCell class={tdClass}>Delta</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>Net delta</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>IV</TableHeadCell>
				<TableHeadCell class={`${tdClass} w-40`}>Theo price</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each putPositions as position}
					<TableBodyRow>
						<TableBodyCell {tdClass} >
							<span>{position.instrument.expiration ? calculateDTE(position.instrument.expiration) : ''} DTE</span>
						</TableBodyCell>
						<TableBodyCell {tdClass} >
							<span>{position.instrument.strike}</span>
						</TableBodyCell>
						<TableBodyCell {tdClass} >
							<Badge class="ml-2" border large color={position['quantity-direction'] == 'Long' ? 'green' : 'red'}
								>{#if position['quantity-direction'] == 'Long'}+{:else}-{/if}{position.quantity}
							</Badge>
						</TableBodyCell>
						<TableBodyCell {tdClass} >{position.delta ? (position.delta * 100).toFixed(2) : ''}</TableBodyCell>
						<TableBodyCell {tdClass} >{position.delta ? (position.quantity * position.delta * 100 * (position['quantity-direction'] == 'Short' ? -1 : 1)).toFixed(2) : ''}</TableBodyCell>
						<TableBodyCell {tdClass} >{position.iv ? (position.iv * 100).toFixed(2) : ''}</TableBodyCell>
						<TableBodyCell {tdClass} >{position.theo ? position.theo.toFixed(2) : ''}</TableBodyCell>
					</TableBodyRow>
				{/each}
			</TableBody>
		</Table>
	</div>
</div>
