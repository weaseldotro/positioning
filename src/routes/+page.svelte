<script lang="ts">
	import { dxFeedEncodeOptionsSymbol, dxfeedConnection, dxfeedSubscribe } from '$lib/dxfeed'
	import { checkSession } from '$lib/tastytrade'
	import { onMount } from 'svelte'
	import ConnectingModal from './modals/ConnectingModal.svelte'
	import AuthorizingModal from './modals/AuthorizingModal.svelte'
	import { tastytradeSession } from '$lib/tastytrade'
	import { tastytradeAccount } from '$lib/tastytrade'
	import AccountSelector from './components/AccountSelector.svelte'
	import DxfeedStatus from './components/DxfeedStatus.svelte'
	import { initMarketData, trades } from '$lib/market'
	import { loadingData } from '$lib/interface'
	import { instruments, loadPositions, tastytradePositions } from '$lib/positions'
	import InstrumentStatistics from './components/InstrumentStatistics.svelte'
	import { EventType } from '@dxfeed/api'

	onMount(async () => {
		if (await checkSession()) {
			$loadingData = true
		}
	})

	let unsubscribers: (() => void)[] = []
	const init = async () => {
		$loadingData = true
		await initMarketData()

		unsubscribers.push(
			await dxfeedSubscribe([EventType.Trade], $instruments, (event) => {
				// console.log(event)
				$trades[event.eventSymbol] = event.price as number
			}),
		)

		$tastytradePositions.forEach(async (position) => {
			// subscribe to the quotes for each position
			unsubscribers.push(
				await dxfeedSubscribe([EventType.Quote], [position.instrument.dxfeedSymbol as string], (event) => {
					for (let i = 0; i < $tastytradePositions.length; i++) {
						if ($tastytradePositions[i].instrument.dxfeedSymbol == event.eventSymbol) {
							$tastytradePositions[i].bid = event.bidPrice as number
							$tastytradePositions[i].ask = event.askPrice as number
							break
						}
					}
				}),
			)
		})

		$loadingData = false
	}

	const unsubscribeFromDxfeed = () => {
		if (unsubscribers.length == 0) {
			return
		}

		unsubscribers.forEach(async (u) => {
			console.log('unsubscribing from dxfeed')
			u()
		})
	}

	$: if ($dxfeedConnection == 'connected' && $tastytradeAccount != '' && $tastytradePositions.length > 0) {
		init()
	}

	$: if ($dxfeedConnection == 'not connected') {
		unsubscribeFromDxfeed()
	}

	$: if ($tastytradeAccount != '') {
		loadPositions()
	}
</script>

{#if $tastytradeSession == 'valid'}
	<div class="flex flex-col sm:flex-row items-center justify-between gap-2 p-2 bg-slate-100">
		<div class="flex items-center gap-2 flex-wrap">
			<!-- {#if $SPYPrice}
				<div>
					<span class="font-bold">SPY:</span>
					<span class="inline-block w-20">{$SPYPrice}</span>
				</div>
			{/if}

			{#if $ESCorrelatedSPYPrice}
				<div>
					<span class="font-bold">Correlated SPY:</span>
					<span class="inline-block w-20">{$ESCorrelatedSPYPrice}</span>
				</div>
			{/if}

			{#if $ESPrice}
				<div>
					<span class="font-bold">ES:</span>
					<span class="inline-block w-20">{$ESPrice}</span>
				</div>
			{/if} -->

			<!-- {#if $ESNextPrice}
				<div>
					<span class="font-bold">ES Next:</span>
					<span class="inline-block w-20">{$ESNextPrice}</span>
				</div>
			{/if} -->

			<!-- <Button
				color="light"
				size="sm"
				on:click={() => {
					let account = $tastytradeAccount
					$tastytradeAccount = ''
					$tastytradeAccount = account
				}}>Reload</Button
			> -->
		</div>

		<div class="flex flex-wrap md:flex-nowrap items-center justify-normal gap-2 md:gap-5 text-sm">
			<DxfeedStatus />
			<AccountSelector />
		</div>
	</div>

	<div class="p-2">
		{#if $tastytradeAccount && $tastytradePositions.length > 0}
			{#each $instruments as instrument}
				<!-- <h2 class="p-2 mb-2 font-semibold text-xl">{instrument}</h2> -->
				<InstrumentStatistics {instrument} />
			{/each}
		{/if}
	</div>
{/if}

<ConnectingModal />
<AuthorizingModal />
