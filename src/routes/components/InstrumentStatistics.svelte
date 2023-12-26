<script lang="ts">
	import { blackScholes, getDelta, getImpliedVolatility } from '$lib/black-scholes'
	import { calculateDTE, calculateEquityOptionsMaintenanceBuyingPower, calculateQuantities, type MaintenanceBuyingPower, type Quantities, type Quantity } from '$lib/calculate'
	import { trades } from '$lib/market'
	import { roundNumber } from '$lib/math'
	import { tastytradePositions, type PositionWithBidAsk } from '$lib/positions'
	import { Badge, Spinner, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte'
	import KeyValue from './KeyValue.svelte'

	export let instrument: string

	const tdClass = 'px-6 py-1 whitespace-nowrap font-medium text-center text-black'

	let expirations: string[] = []
	let maintenanceBuyingPower: MaintenanceBuyingPower = {}
	let callsMaintenanceBuyingPower = 0
	let putsMaintenanceBuyingPower = 0
	let quantities: Quantities = {}
	let totalQuantity: Quantity = {
		shortCallsQty: 0,
		longCallsQty: 0,
		shortPutsQty: 0,
		longPutsQty: 0,
	}
	let updateInterval: number

	let callPositions: PositionWithBidAsk[] = []
	let putPositions: PositionWithBidAsk[] = []
	let greeksInitialized = false

	const updateInstrument = () => {
		let newExpirations: string[] = []
		let multiplier = 0
		callsMaintenanceBuyingPower = 0
		putsMaintenanceBuyingPower = 0
		totalQuantity = {
			shortCallsQty: 0,
			longCallsQty: 0,
			shortPutsQty: 0,
			longPutsQty: 0,
		}

		callPositions = []
		putPositions = []

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
			totalQuantity.shortCallsQty += quantity.shortCallsQty
			totalQuantity.longCallsQty += quantity.longCallsQty
			totalQuantity.shortPutsQty += quantity.shortPutsQty
			totalQuantity.longPutsQty += quantity.longPutsQty
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
		deltaImbalance: number
	}

	let deltas: Record<string, Totals> = {}
	let totals: Totals = {
		shortCallsDeltas: 0,
		longCallsDeltas: 0,
		shortPutsDeltas: 0,
		longPutsDeltas: 0,
		netDelta: 0,
		totalDeltas: 0,
		deltaImbalance: 0,
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

		// sort call and put positions using the delta
		callPositions.sort((a, b) => {
			return (b.delta as number) - (a.delta as number)
		})
		putPositions.sort((a, b) => {
			return (a.delta as number) - (b.delta as number)
		})

		greeksInitialized = true

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
					deltaImbalance: 0,
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
			deltas[expiration].deltaImbalance = roundNumber((deltas[expiration].netDelta / deltas[expiration].totalDeltas) * 100)
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
			deltaImbalance: 0,
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
		totals.deltaImbalance = roundNumber((totals.netDelta / totals.totalDeltas) * 100)
	}

	$: if (instrument) {
		updateInstrument()
	}
</script>

{#if greeksInitialized}
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
					<KeyValue key="Delta imbalance" value={(totals.deltaImbalance > 0 ? '+' : '') + totals.deltaImbalance + '%'} />
				</div>

				<div>
					<KeyValue key="Call deltas" value={roundNumber(totals.shortCallsDeltas + totals.longCallsDeltas)} />
					<KeyValue key="Short calls deltas" value={totals.shortCallsDeltas} />
					<KeyValue key="Long calls deltas" value={totals.longCallsDeltas} />
					<KeyValue key="Short calls qty" value={totalQuantity.shortCallsQty} />
					<KeyValue key="Long calls qty" value={totalQuantity.longCallsQty} />
					{#if callsMaintenanceBuyingPower}
						<KeyValue key="Calls BPR" value={callsMaintenanceBuyingPower} />
					{/if}
					<!-- {#if callsMaintenanceBuyingPower && totalQuantity.shortCalls}
					<KeyValue key="Average BPR / short call" value={Math.round(callsMaintenanceBuyingPower / totalQuantity.shortCalls)} />
				{/if} -->
				</div>

				<div>
					<KeyValue key="Put deltas" value={roundNumber(totals.shortPutsDeltas + totals.longPutsDeltas)} />
					<KeyValue key="Short put deltas" value={totals.shortPutsDeltas} />
					<KeyValue key="Long put deltas" value={totals.longPutsDeltas} />

					<KeyValue key="Short puts qty" value={totalQuantity.shortPutsQty} />
					<KeyValue key="Long puts qty" value={totalQuantity.longPutsQty} />
					{#if putsMaintenanceBuyingPower}
						<KeyValue key="Puts BPR" value={putsMaintenanceBuyingPower} />
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
							<KeyValue key="Delta imbalance" value={(deltas[expiration].deltaImbalance > 0 ? '+' : '') + deltas[expiration].deltaImbalance + '%'} />
						</div>
					{/if}

					<div>
						{#if expiration in deltas}
							<KeyValue key="Call deltas" value={roundNumber(deltas[expiration].shortCallsDeltas + deltas[expiration].longCallsDeltas)} />
							<KeyValue key="Short calls deltas" value={deltas[expiration].shortCallsDeltas} />
							<KeyValue key="Long calls deltas" value={deltas[expiration].longCallsDeltas} />
						{/if}

						{#if expiration in quantities}
							<KeyValue key="Short calls qty" value={quantities[expiration].shortCallsQty} />
							<KeyValue key="Long calls qty" value={quantities[expiration].longCallsQty} />
						{/if}

						{#if expiration in maintenanceBuyingPower}
							<KeyValue key="Calls BPR" value={maintenanceBuyingPower[expiration].calls} />
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
							<KeyValue key="Short puts qty" value={quantities[expiration].shortPutsQty} />
							<KeyValue key="Long puts qty" value={quantities[expiration].longPutsQty} />
						{/if}

						{#if expiration in maintenanceBuyingPower}
							<KeyValue key="Puts BPR" value={maintenanceBuyingPower[expiration].puts} />
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
			{#if callPositions.length == 0}
				<div class="p-2 border border-gray-400">No calls</div>
			{:else}
				<Table class="border w-full max-w-4xl" hoverable>
					<TableHead class="bg-slate-200">
						<TableHeadCell class={tdClass}>DTE</TableHeadCell>
						<TableHeadCell class={tdClass}>Strike</TableHeadCell>
						<TableHeadCell class={tdClass}>Quantity</TableHeadCell>
						<TableHeadCell class={tdClass}>Delta</TableHeadCell>
						<TableHeadCell class={tdClass}>Total deltas</TableHeadCell>
						<TableHeadCell class={tdClass}>IV</TableHeadCell>
						<TableHeadCell class={tdClass}>Theo</TableHeadCell>
					</TableHead>
					<TableBody>
						{#each callPositions as position}
							<TableBodyRow>
								<TableBodyCell {tdClass}>
									<span>{position.instrument.expiration ? calculateDTE(position.instrument.expiration) : ''}</span>
								</TableBodyCell>
								<TableBodyCell {tdClass}>
									<span>{position.instrument.strike}</span>
								</TableBodyCell>
								<TableBodyCell {tdClass}>
									<Badge border color={position['quantity-direction'] == 'Long' ? 'green' : 'red'}
										>{#if position['quantity-direction'] == 'Long'}+{:else}-{/if}{position.quantity}
									</Badge>
								</TableBodyCell>
								<TableBodyCell {tdClass}>{position.delta ? (position.delta * 100).toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.delta ? (position.quantity * position.delta * 100 * (position['quantity-direction'] == 'Short' ? -1 : 1)).toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.iv ? (position.iv * 100).toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.theo ? position.theo.toFixed(2) : ''}</TableBodyCell>
							</TableBodyRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</div>

		<div>
			<h2 class="text-lg font-semibold mb-1">{instrument} Puts</h2>
			{#if putPositions.length == 0}
				<div class="p-2 border border-gray-400">No puts</div>
			{:else}
				<Table class="border w-full max-w-4xl" hoverable>
					<TableHead class="bg-slate-200">
						<TableHeadCell class={tdClass}>DTE</TableHeadCell>
						<TableHeadCell class={tdClass}>Strike</TableHeadCell>
						<TableHeadCell class={tdClass}>Quantity</TableHeadCell>
						<TableHeadCell class={tdClass}>Delta</TableHeadCell>
						<TableHeadCell class={tdClass}>Total deltas</TableHeadCell>
						<TableHeadCell class={tdClass}>IV</TableHeadCell>
						<TableHeadCell class={tdClass}>Theo</TableHeadCell>
					</TableHead>
					<TableBody>
						{#each putPositions as position}
							<TableBodyRow>
								<TableBodyCell {tdClass}>
									<span>{position.instrument.expiration ? calculateDTE(position.instrument.expiration) : ''}</span>
								</TableBodyCell>
								<TableBodyCell {tdClass}>
									<span>{position.instrument.strike}</span>
								</TableBodyCell>
								<TableBodyCell {tdClass}>
									<Badge border color={position['quantity-direction'] == 'Long' ? 'green' : 'red'}
										>{#if position['quantity-direction'] == 'Long'}+{:else}-{/if}{position.quantity}
									</Badge>
								</TableBodyCell>
								<TableBodyCell {tdClass}>{position.delta ? (position.delta * 100).toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.delta ? (position.quantity * position.delta * 100 * (position['quantity-direction'] == 'Short' ? -1 : 1)).toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.iv ? (position.iv * 100).toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.theo ? position.theo.toFixed(2) : ''}</TableBodyCell>
							</TableBodyRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</div>
	</div>
	{:else}
	<Spinner />
{/if}
