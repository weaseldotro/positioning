<script lang="ts">
	import { blackScholes, getDelta, getGamma, getImpliedVolatility, getTheta, getVega } from '$lib/black-scholes'
	import { calculateDTE, calculateEquityOptionsMaintenanceBuyingPower, type MaintenanceBuyingPower, type Quantity } from '$lib/calculate'
	import { trades } from '$lib/market'
	import { roundNumber } from '$lib/math'
	import { tastytradePositions, type PositionWithBidAsk, getMaintenanceBuyingPower } from '$lib/positions'
	import { Badge, Spinner, Table, TableBody, TableBodyCell, TableBodyRow, TableHead, TableHeadCell } from 'flowbite-svelte'
	import KeyValue from './KeyValue.svelte'
	import { OptionSide } from '$lib/types'

	export let instrument: string

	const tdClass = 'px-6 py-1 whitespace-nowrap font-medium text-center text-black'

	let expirations: string[] = []
	let maintenanceBuyingPower: MaintenanceBuyingPower = {}
	let callsMaintenanceBuyingPower = 0
	let putsMaintenanceBuyingPower = 0
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

	interface Statistics {
		netDelta: number
		totalDelta: number
		netGamma: number
		netTheta: number
		netVega: number
		shortCallsQty: number
		longCallsQty: number
		shortPutsQty: number
		longPutsQty: number
		shortCallsDelta: number
		longCallsDelta: number
		shortPutsDelta: number
		longPutsDelta: number
		callDelta: number
		putDelta: number
		callGamma: number
		putGamma: number
		callTheta: number
		putTheta: number
		callVega: number
		putVega: number
		callsExtrinsic: number
		callsIntrinsic: number
		putsExtrinsic: number
		putsIntrinsic: number
		deltaImbalance: number
		extrinsic: number
		intrinsic: number
	}

	let statistics: Record<string, Statistics> = {} // expiration => Statistics
	let totals: Statistics = {
		netGamma: 0,
		netTheta: 0,
		netVega: 0,
		shortCallsQty: 0,
		longCallsQty: 0,
		shortPutsQty: 0,
		longPutsQty: 0,
		shortCallsDelta: 0,
		longCallsDelta: 0,
		shortPutsDelta: 0,
		longPutsDelta: 0,
		callsExtrinsic: 0,
		callsIntrinsic: 0,
		putsExtrinsic: 0,
		putsIntrinsic: 0,
		callDelta: 0,
		putDelta: 0,
		netDelta: 0,
		callGamma: 0,
		putGamma: 0,
		callTheta: 0,
		putTheta: 0,
		callVega: 0,
		putVega: 0,
		totalDelta: 0,
		deltaImbalance: 0,
		extrinsic: 0,
		intrinsic: 0,
	}

	const statisticsGreeks = ['shortCallsDelta', 'longCallsDelta', 'shortPutsDelta', 'longPutsDelta', 'callDelta', 'putDelta', 'netDelta', 'callsExtrinsic', 'callsIntrinsic', 'putsExtrinsic', 'putsIntrinsic', 'totalDelta', 'extrinsic', 'intrinsic', 'putGamma', 'callTheta', 'putTheta', 'callVega', 'putVega', 'callGamma', 'netGamma', 'netTheta', 'netVega']

	const updateInstrument = () => {
		if(!instrument) {
			return
		}

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

			let expiration = position.instrument.expiration as string
			if (!(expiration in statistics)) {
				statistics[expiration] = {
					netGamma: 0,
					netTheta: 0,
					netVega: 0,
					shortCallsQty: 0,
					longCallsQty: 0,
					shortPutsQty: 0,
					longPutsQty: 0,
					shortCallsDelta: 0,
					longCallsDelta: 0,
					shortPutsDelta: 0,
					longPutsDelta: 0,
					callDelta: 0,
					putDelta: 0,
					callsExtrinsic: 0,
					callsIntrinsic: 0,
					putsExtrinsic: 0,
					putsIntrinsic: 0,
					netDelta: 0,
					totalDelta: 0,
					deltaImbalance: 0,
					callGamma: 0,
					putGamma: 0,
					callTheta: 0,
					putTheta: 0,
					callVega: 0,
					putVega: 0,
					extrinsic: 0,
					intrinsic: 0,
				}
			}

			if (position.instrument.side == OptionSide.call) {
				if (position['quantity-direction'] == 'Short') {
					statistics[expiration].shortCallsQty += position.quantity
					totalQuantity.shortCallsQty += position.quantity
				} else if (position['quantity-direction'] == 'Long') {
					statistics[expiration].longCallsQty += position.quantity
					totalQuantity.longCallsQty += position.quantity
				}
			} else if (position.instrument.side == OptionSide.put) {
				if (position['quantity-direction'] == 'Short') {
					statistics[expiration].shortPutsQty += position.quantity
					totalQuantity.shortPutsQty += position.quantity
				} else if (position['quantity-direction'] == 'Long') {
					statistics[expiration].longPutsQty += position.quantity
					totalQuantity.longPutsQty += position.quantity
				}
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

	const updateGreeks = () => {
		if(!(instrument in $trades)) {
			return
		}

		let price = roundNumber($trades[instrument])

		for (let expiration of Object.keys(statistics)) {
			for (let prop of statisticsGreeks) {
				// @ts-ignore
				statistics[expiration][prop] = 0
			}
		}

		$tastytradePositions.forEach((position, i) => {
			if (position['underlying-symbol'] != instrument) {
				return
			}

			if (position.bid && position.ask) {
				let timeToExpiration = (new Date(position['expires-at']).getTime() - new Date().getTime()) / 31536000000
				let mid = roundNumber((position.bid + position.ask) / 2)
				let iv = getImpliedVolatility(mid, price, position.instrument.strike as number, timeToExpiration, 0, position.instrument.side as string, 0.0001)
				$tastytradePositions[i].iv = iv
				$tastytradePositions[i].delta = getDelta(price, position.instrument.strike as number, timeToExpiration, iv, 0, position.instrument.side as string) * 100
				$tastytradePositions[i].gamma = getGamma(price, position.instrument.strike as number, timeToExpiration, iv, 0) * 100
				$tastytradePositions[i].theta = getTheta(price, position.instrument.strike as number, timeToExpiration, iv, 0, position.instrument.side as string, 360) * 100
				$tastytradePositions[i].vega = getVega(price, position.instrument.strike as number, timeToExpiration, iv, 0) * 100
				$tastytradePositions[i].theo = blackScholes(price, position.instrument.strike as number, timeToExpiration, iv, 0, position.instrument.side as string)
				$tastytradePositions[i].intrinsic = (position.instrument.side == 'call' ? Math.max(0, price - (position.instrument.strike as number)) : Math.max(0, (position.instrument.strike as number) - price)) * 100 * position.quantity * (position['quantity-direction'] == 'Short' ? 1 : -1)
				$tastytradePositions[i].extrinsic = (mid - ($tastytradePositions[i].intrinsic as number)) * 100 * position.quantity * (position['quantity-direction'] == 'Short' ? 1 : -1)

				let expiration = position.instrument.expiration as string

				if (position.instrument.side == 'call') {
					for (let j = 0; j < callPositions.length; j++) {
						if (callPositions[j].instrument.dxfeedSymbol == position.instrument.dxfeedSymbol) {
							callPositions[j] = position
							break
						}
					}

					if (position['quantity-direction'] == 'Long') {
						statistics[expiration].longCallsDelta += (position.delta as number) * position.quantity
						statistics[expiration].callGamma += (position.gamma as number) * position.quantity
						statistics[expiration].callTheta += (position.theta as number) * position.quantity
						statistics[expiration].callVega += (position.vega as number) * position.quantity
					} else {
						statistics[expiration].shortCallsDelta += (position.delta as number) * -position.quantity
						statistics[expiration].callGamma += (position.gamma as number) * -position.quantity
						statistics[expiration].callTheta += (position.theta as number) * -position.quantity
						statistics[expiration].callVega += (position.vega as number) * -position.quantity
					}
				} else {
					for (let j = 0; j < putPositions.length; j++) {
						if (putPositions[j].instrument.dxfeedSymbol == position.instrument.dxfeedSymbol) {
							putPositions[j] = position
							break
						}
					}

					if (position['quantity-direction'] == 'Long') {
						statistics[expiration].longPutsDelta += (position.delta as number) * position.quantity
						statistics[expiration].putGamma += (position.gamma as number) * position.quantity
						statistics[expiration].putTheta += (position.theta as number) * position.quantity
						statistics[expiration].putVega += (position.vega as number) * position.quantity
					} else {
						statistics[expiration].shortPutsDelta += (position.delta as number) * -position.quantity
						statistics[expiration].putGamma += (position.gamma as number) * -position.quantity
						statistics[expiration].putTheta += (position.theta as number) * -position.quantity
						statistics[expiration].putVega += (position.vega as number) * -position.quantity
					}
				}

				statistics[expiration].callDelta = roundNumber(statistics[expiration].shortCallsDelta + statistics[expiration].longCallsDelta, 0)
				statistics[expiration].putDelta = roundNumber(statistics[expiration].shortPutsDelta + statistics[expiration].longPutsDelta, 0)
				statistics[expiration].netDelta = roundNumber(statistics[expiration].shortCallsDelta + statistics[expiration].longCallsDelta + statistics[expiration].shortPutsDelta + statistics[expiration].longPutsDelta, 0)
				statistics[expiration].totalDelta = Math.abs(statistics[expiration].shortCallsDelta + statistics[expiration].longCallsDelta) + Math.abs(statistics[expiration].shortPutsDelta + statistics[expiration].longPutsDelta)
				statistics[expiration].deltaImbalance = roundNumber((statistics[expiration].netDelta / statistics[expiration].totalDelta) * 100, 2)

				statistics[expiration].netTheta = roundNumber(statistics[expiration].callTheta + statistics[expiration].putTheta, 0)
				statistics[expiration].netGamma = roundNumber(statistics[expiration].callGamma + statistics[expiration].putGamma, 0)
				statistics[expiration].netVega = roundNumber(statistics[expiration].callVega + statistics[expiration].putVega, 0)

				statistics[expiration].intrinsic += $tastytradePositions[i].intrinsic as number
				statistics[expiration].extrinsic += $tastytradePositions[i].extrinsic as number

				if (position.instrument.side == 'call') {
					statistics[expiration].callsIntrinsic += $tastytradePositions[i].intrinsic as number
					statistics[expiration].callsExtrinsic += $tastytradePositions[i].extrinsic as number
				} else {
					statistics[expiration].putsIntrinsic += $tastytradePositions[i].intrinsic as number
					statistics[expiration].putsExtrinsic += $tastytradePositions[i].extrinsic as number
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

		// round the statistics values
		for (let expiration of Object.keys(statistics)) {
			for (let prop of statisticsGreeks) {
				// @ts-ignore
				statistics[expiration][prop] = roundNumber(statistics[expiration][prop], 0)
			}
		}

		// sum up all the delta for all expirations
		for (let prop of statisticsGreeks) {
			// @ts-ignore
			totals[prop] = roundNumber(Object.values(statistics).reduce((a, b) => a + (b[prop] || 0), 0), 0)
		}

		totals.deltaImbalance = roundNumber((totals.netDelta / totals.totalDelta) * 100)

		greeksInitialized = true
	}

	$: if (instrument) {
		updateInstrument()
	}
</script>

{#if greeksInitialized}
	<div class="flex flex-wrap gap-3 justify-center items-start">
		<div class="w-full max-w-xl p-2 border border-green-300">
			<h2 class="p-2 bg-green-200 mb-2 font-semibold -mt-2 -mx-2 flex justify-between">
				<div class="w-20">{instrument}</div>
				<div>Totals</div>
				<div class="w-20 text-right">
					{#if $trades && $trades[instrument]}${$trades[instrument]}{/if}
				</div>
			</h2>

			<div class="grid sm:grid-cols-2 gap-x-3">
				<div>
					<KeyValue key="Delta" value={totals.netDelta} />
					<KeyValue key="Gamma" value={totals.netGamma} />
					<KeyValue key="Theta" value={totals.netTheta} />
					<KeyValue key="Vega" value={totals.netVega} />
				</div>
				<div>
					<KeyValue key="Delta imbalance" value={(totals.deltaImbalance > 0 ? '+' : '') + totals.deltaImbalance + '%'} />
					<KeyValue key="Intrinsic" value={totals.intrinsic} />
					<KeyValue key="Extrinsic" value={totals.extrinsic} />
					<KeyValue key="BPR" value={getMaintenanceBuyingPower(instrument)} />
				</div>

				<div class="mt-3"></div>
				<div class="mt-3 hidden sm:block"></div>

				<div>
					<h3 class="font-semibold text-center bg-slate-100">Calls</h3>
					<KeyValue key="Delta" value={totals.callDelta} />
					<KeyValue key="Short delta" value={totals.shortCallsDelta} />
					<KeyValue key="Long delta" value={totals.longCallsDelta} />
					<KeyValue key="Gamma" value={totals.callGamma} />
					<KeyValue key="Theta" value={totals.callTheta} />
					<KeyValue key="Vega" value={totals.callVega} />

					<KeyValue key="Short qty" value={totalQuantity.shortCallsQty} />
					<KeyValue key="Long qty" value={totalQuantity.longCallsQty} />
					<KeyValue key="Intrinsic" value={totals.callsIntrinsic} />
					<KeyValue key="Extrinsic" value={totals.callsExtrinsic} />
					{#if callsMaintenanceBuyingPower}
						<KeyValue key="BPR" value={callsMaintenanceBuyingPower} />
					{/if}
					<!-- {#if callsMaintenanceBuyingPower && totalQuantity.shortCalls}
					<KeyValue key="Average BPR / short call" value={Math.round(callsMaintenanceBuyingPower / totalQuantity.shortCalls)} />
				{/if} -->
				</div>

				<div>
					<h3 class="font-semibold text-center bg-slate-100">Puts</h3>
					<KeyValue key="Delta" value={totals.putDelta} />
					<KeyValue key="Short delta" value={totals.shortPutsDelta} />
					<KeyValue key="Long delta" value={totals.longPutsDelta} />
					<KeyValue key="Gamma" value={totals.putGamma} />
					<KeyValue key="Theta" value={totals.putTheta} />
					<KeyValue key="Vega" value={totals.putVega} />

					<KeyValue key="Short qty" value={totalQuantity.shortPutsQty} />
					<KeyValue key="Long qty" value={totalQuantity.longPutsQty} />
					<KeyValue key="Intrinsic" value={totals.putsIntrinsic} />
					<KeyValue key="Extrinsic" value={totals.putsExtrinsic} />
					{#if putsMaintenanceBuyingPower}
						<KeyValue key="BPR" value={putsMaintenanceBuyingPower} />
					{/if}
					<!-- {#if putsMaintenanceBuyingPower && totalQuantity.shortPuts}
					<KeyValue key="Average BPR / short put" value={Math.round(putsMaintenanceBuyingPower / totalQuantity.shortPuts)} />
				{/if} -->
				</div>
			</div>
		</div>

		{#each expirations as expiration}
			<div class="w-full max-w-xl p-2 border border-blue-200">
				<h2 class="p-2 bg-blue-100 mb-2 font-semibold -mt-2 -mx-2 flex justify-between">
					<div class="w-20">{instrument}</div>
					<div>{new Date(expiration).toLocaleDateString()} expiration</div>
					<div class="w-20 text-right">{calculateDTE(expiration)} DTE</div>
				</h2>

				<div class="grid sm:grid-cols-2 gap-x-3">
					<div>
						<KeyValue key="Delta" value={statistics[expiration].netDelta} />
						<KeyValue key="Gamma" value={statistics[expiration].netGamma} />
						<KeyValue key="Theta" value={statistics[expiration].netTheta} />
						<KeyValue key="Vega" value={statistics[expiration].netVega} />
					</div>
					<div>
						<KeyValue key="Delta imbalance" value={(statistics[expiration].deltaImbalance > 0 ? '+' : '') + statistics[expiration].deltaImbalance + '%'} />
						<KeyValue key="Intrinsic" value={statistics[expiration].intrinsic} />
						<KeyValue key="Extrinsic" value={statistics[expiration].extrinsic} />
						<KeyValue key="BPR" value={maintenanceBuyingPower[expiration].calls > maintenanceBuyingPower[expiration].puts ? maintenanceBuyingPower[expiration].calls : maintenanceBuyingPower[expiration].puts} />
					</div>

					<div class="mt-3"></div>
					<div class="mt-3 hidden sm:block"></div>

					<div>
						<h3 class="font-semibold text-center bg-slate-100">Calls</h3>
						<KeyValue key="Delta" value={statistics[expiration].callDelta} />
						<KeyValue key="Short delta" value={statistics[expiration].shortCallsDelta} />
						<KeyValue key="Long delta" value={statistics[expiration].longCallsDelta} />
						<KeyValue key="Gamma" value={statistics[expiration].callGamma} />
						<KeyValue key="Theta" value={statistics[expiration].callTheta} />
						<KeyValue key="Vega" value={statistics[expiration].callVega} />

						<KeyValue key="Short qty" value={statistics[expiration].shortCallsQty} />
						<KeyValue key="Long qty" value={statistics[expiration].longCallsQty} />
						<KeyValue key="Intrinsic" value={statistics[expiration].callsIntrinsic} />
						<KeyValue key="Extrinsic" value={statistics[expiration].callsExtrinsic} />
						<KeyValue key="BPR" value={maintenanceBuyingPower[expiration].calls} />

						<!-- {#if expiration in maintenanceBuyingPower && statistics[expiration].shortCalls}
						<KeyValue key="Average BPR / short call" value={Math.round(maintenanceBuyingPower[expiration].calls / statistics[expiration].shortCalls)} />
					{/if} -->
					</div>

					<div>
						<h3 class="font-semibold text-center bg-slate-100">Puts</h3>
						<KeyValue key="Delta" value={statistics[expiration].putDelta} />
						<KeyValue key="Short delta" value={statistics[expiration].shortPutsDelta} />
						<KeyValue key="Long delta" value={statistics[expiration].longPutsDelta} />
						<KeyValue key="Gamma" value={statistics[expiration].putGamma} />
						<KeyValue key="Theta" value={statistics[expiration].putTheta} />
						<KeyValue key="Vega" value={statistics[expiration].putVega} />

						<KeyValue key="Short qty" value={statistics[expiration].shortPutsQty} />
						<KeyValue key="Long qty" value={statistics[expiration].longPutsQty} />
						<KeyValue key="Intrinsic" value={statistics[expiration].putsIntrinsic} />
						<KeyValue key="Extrinsic" value={statistics[expiration].putsExtrinsic} />
						<KeyValue key="BPR" value={maintenanceBuyingPower[expiration].puts} />

						<!-- {#if expiration in maintenanceBuyingPower && statistics[expiration].shortPuts}
						<KeyValue key="Average BPR / short put" value={Math.round(maintenanceBuyingPower[expiration].puts / statistics[expiration].shortPuts)} />
					{/if} -->
					</div>
				</div>
			</div>
		{/each}
	</div>

	<div class="grid xl:grid-cols-2 gap-2 mt-2">
		<div class="mx-auto">
			<h2 class="text-lg font-semibold mb-1">{instrument} Calls</h2>
			{#if callPositions.length == 0}
				<div class="p-2 border border-gray-400">No calls</div>
			{:else}
				<Table class="border w-full max-w-4xl" hoverable>
					<TableHead class="bg-slate-200">
						<TableHeadCell class={tdClass}>DTE</TableHeadCell>
						<TableHeadCell class={tdClass}>Strike</TableHeadCell>
						<TableHeadCell class={tdClass}>Qty</TableHeadCell>
						<TableHeadCell class={tdClass}>Delta</TableHeadCell>
						<!-- <TableHeadCell class={tdClass}>Total delta</TableHeadCell> -->
						<TableHeadCell class={tdClass}>Gamma</TableHeadCell>
						<TableHeadCell class={tdClass}>Theta</TableHeadCell>
						<TableHeadCell class={tdClass}>Vega</TableHeadCell>
						<TableHeadCell class={tdClass}>IV</TableHeadCell>
						<!-- <TableHeadCell class={tdClass}>Theo</TableHeadCell> -->
						<!-- <TableHeadCell class={tdClass}>Intrinsic</TableHeadCell>
						<TableHeadCell class={tdClass}>Extrinsic</TableHeadCell> -->
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
								<TableBodyCell {tdClass}>{position.delta.toFixed(2)}</TableBodyCell>
								<!-- <TableBodyCell {tdClass}>{(position.quantity * position.delta * (position['quantity-direction'] == 'Short' ? -1 : 1)).toFixed(2)}</TableBodyCell> -->
								<TableBodyCell {tdClass}>{position.gamma.toFixed(2)}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.theta.toFixed(2)}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.vega.toFixed(2)}</TableBodyCell>
								<TableBodyCell {tdClass}>{(position.iv * 100).toFixed(2)}</TableBodyCell>
								<!-- <TableBodyCell {tdClass}>{position.theo.toFixed(2)}</TableBodyCell> -->
								<!-- <TableBodyCell {tdClass}>{position.intrinsic.toFixed(2)}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.extrinsic.toFixed(2)}</TableBodyCell> -->
							</TableBodyRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</div>

		<div class="mx-auto">
			<h2 class="text-lg font-semibold mb-1">{instrument} Puts</h2>
			{#if putPositions.length == 0}
				<div class="p-2 border border-gray-400">No puts</div>
			{:else}
				<Table class="border w-full max-w-4xl" hoverable>
					<TableHead class="bg-slate-200">
						<TableHeadCell class={tdClass}>DTE</TableHeadCell>
						<TableHeadCell class={tdClass}>Strike</TableHeadCell>
						<TableHeadCell class={tdClass}>Qty</TableHeadCell>
						<TableHeadCell class={tdClass}>Delta</TableHeadCell>
						<!-- <TableHeadCell class={tdClass}>Total delta</TableHeadCell> -->
						<TableHeadCell class={tdClass}>Gamma</TableHeadCell>
						<TableHeadCell class={tdClass}>Theta</TableHeadCell>
						<TableHeadCell class={tdClass}>Vega</TableHeadCell>
						<TableHeadCell class={tdClass}>IV</TableHeadCell>
						<!-- <TableHeadCell class={tdClass}>Theo</TableHeadCell> -->
						<!-- <TableHeadCell class={tdClass}>Intrinsic</TableHeadCell> -->
						<!-- <TableHeadCell class={tdClass}>Extrinsic</TableHeadCell> -->
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
								<TableBodyCell {tdClass}>{position.delta.toFixed(2)}</TableBodyCell>
								<!-- <TableBodyCell {tdClass}>{(position.quantity * position.delta * (position['quantity-direction'] == 'Short' ? -1 : 1)).toFixed(2)}</TableBodyCell> -->
								<TableBodyCell {tdClass}>{position.gamma.toFixed(2)}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.theta.toFixed(2)}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.vega.toFixed(2)}</TableBodyCell>
								<TableBodyCell {tdClass}>{(position.iv * 100).toFixed(2)}</TableBodyCell>
								<!-- <TableBodyCell {tdClass}>{position.theo.toFixed(2)}</TableBodyCell> -->
								<!-- <TableBodyCell {tdClass}>{position.intrinsic.toFixed(2)}</TableBodyCell>
								<TableBodyCell {tdClass}>{position.extrinsic.toFixed(2)}</TableBodyCell> -->
							</TableBodyRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</div>
	</div>
{:else if instrument}
	<Spinner />
{/if}
