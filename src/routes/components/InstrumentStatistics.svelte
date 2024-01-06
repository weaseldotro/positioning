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

	const tdClass = 'px-6 py-1 font-medium text-center text-black'

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
		extrinsic: number
		intrinsic: number
		deltaImbalance: number
		gammaImbalance: number
		thetaImbalance: number
		vegaImbalance: number
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
		extrinsic: 0,
		intrinsic: 0,
		deltaImbalance: 0,
		gammaImbalance: 0,
		thetaImbalance: 0,
		vegaImbalance: 0,
	}

	const statisticsGreeks = ['shortCallsDelta', 'longCallsDelta', 'shortPutsDelta', 'longPutsDelta', 'callDelta', 'putDelta', 'netDelta', 'callsExtrinsic', 'callsIntrinsic', 'putsExtrinsic', 'putsIntrinsic', 'totalDelta', 'extrinsic', 'intrinsic', 'putGamma', 'callTheta', 'putTheta', 'callVega', 'putVega', 'callGamma', 'netGamma', 'netTheta', 'netVega']

	const updateInstrument = () => {
		if (!instrument) {
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
					callGamma: 0,
					putGamma: 0,
					callTheta: 0,
					putTheta: 0,
					callVega: 0,
					putVega: 0,
					extrinsic: 0,
					intrinsic: 0,
					deltaImbalance: 0,
					gammaImbalance: 0,
					thetaImbalance: 0,
					vegaImbalance: 0,
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
		if (!(instrument in $trades)) {
			return
		}

		let underlyingPrice = roundNumber($trades[instrument])

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

			let sum = position.bid + position.ask
			if (!sum) {
				return
			}

			let positionMidPrice = roundNumber(sum / 2)
			let timeToExpiration = (new Date(position['expires-at']).getTime() - new Date().getTime()) / 31536000000
			let iv = getImpliedVolatility(positionMidPrice, underlyingPrice, position.instrument.strike as number, timeToExpiration, 0, position.instrument.side as string, 0.0001)
			$tastytradePositions[i].iv = iv
			$tastytradePositions[i].delta = getDelta(underlyingPrice, position.instrument.strike as number, timeToExpiration, iv, 0, position.instrument.side as string) * 100
			$tastytradePositions[i].gamma = getGamma(underlyingPrice, position.instrument.strike as number, timeToExpiration, iv, 0) * 100
			$tastytradePositions[i].theta = getTheta(underlyingPrice, position.instrument.strike as number, timeToExpiration, iv, 0, position.instrument.side as string, 360) * 100
			$tastytradePositions[i].vega = getVega(underlyingPrice, position.instrument.strike as number, timeToExpiration, iv, 0) * 100
			$tastytradePositions[i].theo = blackScholes(underlyingPrice, position.instrument.strike as number, timeToExpiration, iv, 0, position.instrument.side as string)
			$tastytradePositions[i].intrinsic = (position.instrument.side == 'call' ? Math.max(0, underlyingPrice - (position.instrument.strike as number)) : Math.max(0, (position.instrument.strike as number) - underlyingPrice)) * 100 * position.quantity * (position['quantity-direction'] == 'Short' ? 1 : -1)
			$tastytradePositions[i].extrinsic = (positionMidPrice - ($tastytradePositions[i].intrinsic as number)) * 100 * position.quantity * (position['quantity-direction'] == 'Short' ? 1 : -1)
			position = $tastytradePositions[i]

			let expiration = position.instrument.expiration as string

			statistics[expiration].intrinsic += position.intrinsic as number
			statistics[expiration].extrinsic += position.extrinsic as number

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

				statistics[expiration].callsIntrinsic += position.intrinsic as number
				statistics[expiration].callsExtrinsic += position.extrinsic as number
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

				statistics[expiration].putsIntrinsic += position.intrinsic as number
				statistics[expiration].putsExtrinsic += position.extrinsic as number
			}
		})

		// sort call and put positions using the delta
		callPositions.sort((a, b) => {
			if (!('delta' in a) || !('delta' in b)) {
				return 0
			}
			return (b.delta as number) - (a.delta as number)
		})
		putPositions.sort((a, b) => {
			if (!('delta' in a) || !('delta' in b)) {
				return 0
			}

			return (a.delta as number) - (b.delta as number)
		})

		// round the statistics values
		for (let expiration of Object.keys(statistics)) {
			statistics[expiration].callDelta = roundNumber(statistics[expiration].shortCallsDelta + statistics[expiration].longCallsDelta, 0)
			statistics[expiration].putDelta = roundNumber(statistics[expiration].shortPutsDelta + statistics[expiration].longPutsDelta, 0)
			statistics[expiration].netDelta = roundNumber(statistics[expiration].shortCallsDelta + statistics[expiration].longCallsDelta + statistics[expiration].shortPutsDelta + statistics[expiration].longPutsDelta, 0)
			statistics[expiration].totalDelta = Math.abs(statistics[expiration].shortCallsDelta + statistics[expiration].longCallsDelta) + Math.abs(statistics[expiration].shortPutsDelta + statistics[expiration].longPutsDelta)

			statistics[expiration].netTheta = roundNumber(statistics[expiration].callTheta + statistics[expiration].putTheta, 0)
			statistics[expiration].netGamma = roundNumber(statistics[expiration].callGamma + statistics[expiration].putGamma, 0)
			statistics[expiration].netVega = roundNumber(statistics[expiration].callVega + statistics[expiration].putVega, 0)

			statistics[expiration].deltaImbalance = roundNumber((Math.abs(statistics[expiration].netDelta) / statistics[expiration].totalDelta) * 100, 2)
			statistics[expiration].gammaImbalance = roundNumber((Math.abs(statistics[expiration].callGamma) - Math.abs(statistics[expiration].putGamma)) / Math.abs((statistics[expiration].callGamma + statistics[expiration].putGamma) / 2) * 100, 0)
			statistics[expiration].thetaImbalance = roundNumber((Math.abs(statistics[expiration].callTheta) - Math.abs(statistics[expiration].putTheta)) / Math.abs((statistics[expiration].callTheta + statistics[expiration].putTheta) / 2) * 100, 0)
			statistics[expiration].vegaImbalance = roundNumber((Math.abs(statistics[expiration].callVega) - Math.abs(statistics[expiration].putVega)) / Math.abs((statistics[expiration].callVega + statistics[expiration].putVega) / 2) * 100, 0)

			for (let prop of statisticsGreeks) {
				// @ts-ignore
				statistics[expiration][prop] = roundNumber(statistics[expiration][prop], 0)
			}
		}

		// sum up all the delta for all expirations
		for (let prop of statisticsGreeks) {
			totals[prop] = roundNumber(
				Object.values(statistics).reduce((a, b) => a + (b[prop] || 0), 0),
				0,
			)
		}

		totals.deltaImbalance = roundNumber((Math.abs(totals.netDelta) / totals.totalDelta) * 100)
		totals.gammaImbalance = roundNumber((Math.abs(totals.callGamma) - Math.abs(totals.putGamma)) / Math.abs((totals.callGamma + totals.putGamma) / 2) * 100, 0)
		totals.thetaImbalance = roundNumber((Math.abs(totals.callTheta) - Math.abs(totals.putTheta)) / Math.abs((totals.callTheta + totals.putTheta) / 2) * 100, 0)
		totals.vegaImbalance = roundNumber((Math.abs(totals.callVega) - Math.abs(totals.putVega)) / Math.abs((totals.callVega + totals.putVega) / 2) * 100, 0)

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

			<div class="grid sm:grid-cols-3 gap-x-3">
				<div>
					<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100">Greeks</h3>
					<KeyValue key="Delta" value={totals.netDelta} />
					<KeyValue key="Gamma" value={totals.netGamma} />
					<KeyValue key="Theta" value={totals.netTheta} />
					<KeyValue key="Vega" value={totals.netVega} />
				</div>
				<div>
					<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100">Imbalances</h3>
					<KeyValue key="Delta" value={totals.deltaImbalance + '%'} color={Math.abs(totals.callDelta) > Math.abs(totals.putDelta) ? 'text-green-500' : 'text-red-500'} />
					<KeyValue key="Gamma" value={totals.gammaImbalance + '%'} color={Math.abs(totals.callGamma) > Math.abs(totals.putGamma) ? 'text-green-500' : 'text-red-500'} />
					<KeyValue key="Theta" value={totals.thetaImbalance + '%'} color={Math.abs(totals.callTheta) > Math.abs(totals.putTheta) ? 'text-green-500' : 'text-red-500'} />
					<KeyValue key="Vega" value={totals.vegaImbalance + '%'} color={Math.abs(totals.callVega) > Math.abs(totals.putVega) ? 'text-green-500' : 'text-red-500'} />
				</div>
				<div>
					<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100">Amounts</h3>
					<KeyValue key="Intrinsic" value={totals.intrinsic} />
					<KeyValue key="Extrinsic" value={totals.extrinsic} />
					<KeyValue key="BPR" value={getMaintenanceBuyingPower(instrument)} />
				</div>
			</div>

			<div class="grid sm:grid-cols-2 gap-x-3 mt-3">
				<div>
					<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100 text-green-500">Calls</h3>
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
				</div>

				<div>
					<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100 text-red-500">Puts</h3>
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

				<div class="grid sm:grid-cols-3 gap-x-3">
					<div>
						<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100">Greeks</h3>
						<KeyValue key="Delta" value={statistics[expiration].netDelta} />
						<KeyValue key="Gamma" value={statistics[expiration].netGamma} />
						<KeyValue key="Theta" value={statistics[expiration].netTheta} />
						<KeyValue key="Vega" value={statistics[expiration].netVega} />
					</div>
					<div>
						<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100">Imbalances</h3>
						<KeyValue key="Delta" value={statistics[expiration].deltaImbalance + '%'} color={Math.abs(statistics[expiration].callDelta) > Math.abs(statistics[expiration].putDelta) ? 'text-green-500' : 'text-red-500'} />
						<KeyValue key="Gamma" value={statistics[expiration].gammaImbalance + '%'} color={Math.abs(statistics[expiration].callGamma) > Math.abs(statistics[expiration].putGamma) ? 'text-green-500' : 'text-red-500'} />
						<KeyValue key="Theta" value={statistics[expiration].thetaImbalance + '%'} color={Math.abs(statistics[expiration].callTheta) > Math.abs(statistics[expiration].putTheta) ? 'text-green-500' : 'text-red-500'} />
						<KeyValue key="Vega" value={statistics[expiration].vegaImbalance + '%'} color={Math.abs(statistics[expiration].callVega) > Math.abs(statistics[expiration].putVega) ? 'text-green-500' : 'text-red-500'} />
					</div>
					<div>
						<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100">Amounts</h3>
						<KeyValue key="Intrinsic" value={statistics[expiration].intrinsic} />
						<KeyValue key="Extrinsic" value={statistics[expiration].extrinsic} />
						<KeyValue key="BPR" value={maintenanceBuyingPower[expiration].calls > maintenanceBuyingPower[expiration].puts ? maintenanceBuyingPower[expiration].calls : maintenanceBuyingPower[expiration].puts} />
					</div>
				</div>

				<div class="grid sm:grid-cols-2 gap-x-3 mt-3">
					<div>
						<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100 text-green-500">Calls</h3>
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
					</div>

					<div>
						<h3 class="p-1 uppercase text-xs font-semibold text-center bg-slate-100 text-red-500">Puts</h3>
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
				<Table class="border" hoverable>
					<TableHead class="bg-slate-200">
						<TableHeadCell class={tdClass}>DTE</TableHeadCell>
						<TableHeadCell class={tdClass}>Strike</TableHeadCell>
						<TableHeadCell class={tdClass}>Qty</TableHeadCell>
						<TableHeadCell class={tdClass}>Delta</TableHeadCell>
						<TableHeadCell class={tdClass}>Gamma</TableHeadCell>
						<TableHeadCell class={tdClass}>Theta</TableHeadCell>
						<TableHeadCell class={tdClass}>Vega</TableHeadCell>
						<TableHeadCell class={tdClass}>IV</TableHeadCell>
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
								<TableBodyCell {tdClass}>{'delta' in position ? position.delta.toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{'gamma' in position ? position.gamma.toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{'theta' in position ? position.theta.toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{'vega' in position ? position.vega.toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{'iv' in position ? (position.iv * 100).toFixed(2) : ''}</TableBodyCell>
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
				<Table class="border" hoverable>
					<TableHead class="bg-slate-200">
						<TableHeadCell class={tdClass}>DTE</TableHeadCell>
						<TableHeadCell class={tdClass}>Strike</TableHeadCell>
						<TableHeadCell class={tdClass}>Qty</TableHeadCell>
						<TableHeadCell class={tdClass}>Delta</TableHeadCell>
						<TableHeadCell class={tdClass}>Gamma</TableHeadCell>
						<TableHeadCell class={tdClass}>Theta</TableHeadCell>
						<TableHeadCell class={tdClass}>Vega</TableHeadCell>
						<TableHeadCell class={tdClass}>IV</TableHeadCell>
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
								<TableBodyCell {tdClass}>{'delta' in position ? position.delta.toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{'gamma' in position ? position.gamma.toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{'theta' in position ? position.theta.toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{'vega' in position ? position.vega.toFixed(2) : ''}</TableBodyCell>
								<TableBodyCell {tdClass}>{'iv' in position ? (position.iv * 100).toFixed(2) : ''}</TableBodyCell>
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
