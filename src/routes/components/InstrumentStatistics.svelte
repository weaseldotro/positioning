<script lang="ts">
	import { blackScholes, getDelta, getImpliedVolatility } from '$lib/black-scholes'
	import { calculateDTE, calculateEquityOptionsMaintenanceBuyingPower, calculateQuantities, type MaintenanceBuyingPower, type Quantities, type Quantity } from '$lib/calculate'
	import { trades } from '$lib/market'
	import { roundNumber } from '$lib/math'
	import { tastytradePositions } from '$lib/positions'
	import KeyValue from './KeyValue.svelte'

	export let instrument: string

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

	interface Deltas {
		shortCalls: number
		longCalls: number
		shortPuts: number
		longPuts: number
	}

	let deltas: Record<string, Deltas> = {}
	let totalDeltas: Deltas = {
		shortCalls: 0,
		longCalls: 0,
		shortPuts: 0,
		longPuts: 0,
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
				// console.log('greeks', $tastytradePositions[i])
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
					shortCalls: 0,
					longCalls: 0,
					shortPuts: 0,
					longPuts: 0,
				}
			}

			if (position.instrument.side == 'call') {
				if (position['quantity-direction'] == 'Long') {
					deltas[expiration].longCalls += (position.delta as number) * position.quantity
				} else {
					deltas[expiration].shortCalls += (position.delta as number) * -position.quantity
				}
			} else {
				if (position['quantity-direction'] == 'Long') {
					deltas[expiration].longPuts += (position.delta as number) * position.quantity
				} else {
					deltas[expiration].shortPuts += (position.delta as number) * -position.quantity
				}
			}
		})

		// multiply deltas by 100 and round
		Object.values(deltas).forEach((d) => {
			d.shortCalls = roundNumber(d.shortCalls * 100)
			d.longCalls = roundNumber(d.longCalls * 100)
			d.shortPuts = roundNumber(d.shortPuts * 100)
			d.longPuts = roundNumber(d.longPuts * 100)
		})

		// sum up all the deltas for all expirations
		totalDeltas = {
			shortCalls: 0,
			longCalls: 0,
			shortPuts: 0,
			longPuts: 0,
		}
		Object.values(deltas).forEach((d) => {
			totalDeltas.shortCalls += d.shortCalls
			totalDeltas.longCalls += d.longCalls
			totalDeltas.shortPuts += d.shortPuts
			totalDeltas.longPuts += d.longPuts
		})

		totalDeltas.shortCalls = roundNumber(totalDeltas.shortCalls)
		totalDeltas.longCalls = roundNumber(totalDeltas.longCalls)
		totalDeltas.shortPuts = roundNumber(totalDeltas.shortPuts)
		totalDeltas.longPuts = roundNumber(totalDeltas.longPuts)
	}

	$: if (instrument) {
		updateInstrument()
	}
</script>

<div class="space-y-8">
	<div>
		<h2 class="p-2 bg-green-200 mb-2 font-semibold">
			{instrument}
			{#if $trades && $trades[instrument]}trading at {$trades[instrument]}{/if}
		</h2>

		<div>
			<KeyValue key="Total deltas" value={roundNumber(totalDeltas.shortCalls + totalDeltas.longCalls + totalDeltas.shortPuts + totalDeltas.longPuts)} />
		</div>

		<div class="grid md:grid-cols-2 gap-1">
			<div>
				<KeyValue key="Call deltas" value={roundNumber(totalDeltas.shortCalls + totalDeltas.longCalls)} />
				<KeyValue key="Short call deltas" value={totalDeltas.shortCalls} />
				<KeyValue key="Long call deltas" value={totalDeltas.longCalls} />
				<KeyValue key="Number of short calls" value={totalQuantity.shortCalls} />
				<KeyValue key="Number of long calls" value={totalQuantity.longCalls} />
				{#if callsMaintenanceBuyingPower}
					<KeyValue key="Total calls maintenance BPR" value={callsMaintenanceBuyingPower} />
				{/if}
				{#if callsMaintenanceBuyingPower && totalQuantity.shortCalls}
					<KeyValue key="Average maintenance BPR / short call" value={Math.round(callsMaintenanceBuyingPower / totalQuantity.shortCalls)} />
				{/if}
			</div>

			<div>
				<KeyValue key="Put deltas" value={roundNumber(totalDeltas.shortPuts + totalDeltas.longPuts)} />
				<KeyValue key="Short put deltas" value={totalDeltas.shortPuts} />
				<KeyValue key="Long put deltas" value={totalDeltas.longPuts} />

				<KeyValue key="Number of short puts" value={totalQuantity.shortPuts} />
				<KeyValue key="Number of long puts" value={totalQuantity.longPuts} />
				{#if putsMaintenanceBuyingPower}
					<KeyValue key="Total puts maintenance BPR" value={putsMaintenanceBuyingPower} />
				{/if}
				{#if putsMaintenanceBuyingPower && totalQuantity.shortPuts}
					<KeyValue key="Average maintenance BPR / short put" value={Math.round(putsMaintenanceBuyingPower / totalQuantity.shortPuts)} />
				{/if}
			</div>
		</div>
	</div>

	{#each expirations as expiration}
		<div class="border-l-4 border-blue-400 pl-2">
			<h2 class="p-2 bg-blue-100 mb-2 font-semibold">
				{instrument}
				{expiration} expiration ({calculateDTE(expiration)} DTE)
			</h2>

			{#if expiration in deltas}
				<div>
					<KeyValue key="Total deltas" value={roundNumber(deltas[expiration].shortCalls + deltas[expiration].longCalls + deltas[expiration].shortPuts + deltas[expiration].longPuts)} />
				</div>
			{/if}

			<div class="grid md:grid-cols-2 gap-1">
				<div>
					{#if expiration in deltas}
						<KeyValue key="Call deltas" value={roundNumber(deltas[expiration].shortCalls + deltas[expiration].longCalls)} />
						<KeyValue key="Short call deltas" value={deltas[expiration].shortCalls} />
						<KeyValue key="Long call deltas" value={deltas[expiration].longCalls} />
					{/if}

					{#if expiration in quantities}
						<KeyValue key="Number of short calls" value={quantities[expiration].shortCalls} />
						<KeyValue key="Number of long calls" value={quantities[expiration].longCalls} />
					{/if}

					{#if expiration in maintenanceBuyingPower}
						<KeyValue key="Total calls maintenance BPR" value={maintenanceBuyingPower[expiration].calls} />
					{/if}

					{#if expiration in maintenanceBuyingPower && quantities[expiration].shortCalls}
						<KeyValue key="Average maintenance BPR / short call" value={Math.round(maintenanceBuyingPower[expiration].calls / quantities[expiration].shortCalls)} />
					{/if}
				</div>

				<div>
					{#if expiration in deltas}
						<KeyValue key="Put deltas" value={roundNumber(deltas[expiration].shortPuts + deltas[expiration].longPuts)} />
						<KeyValue key="Short put deltas" value={deltas[expiration].shortPuts} />
						<KeyValue key="Long put deltas" value={deltas[expiration].longPuts} />
					{/if}

					{#if expiration in quantities}
						<KeyValue key="Number of short puts" value={quantities[expiration].shortPuts} />
						<KeyValue key="Number of long puts" value={quantities[expiration].longPuts} />
					{/if}

					{#if expiration in maintenanceBuyingPower}
						<KeyValue key="Total puts maintenance BPR" value={maintenanceBuyingPower[expiration].puts} />
					{/if}

					{#if expiration in maintenanceBuyingPower && quantities[expiration].shortPuts}
						<KeyValue key="Average maintenance BPR / short put" value={Math.round(maintenanceBuyingPower[expiration].puts / quantities[expiration].shortPuts)} />
					{/if}
				</div>
			</div>
		</div>
	{/each}
</div>
