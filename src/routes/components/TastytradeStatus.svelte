<script lang="ts">
	import { tastytradeConnection } from '$lib/tastytrade'
	import { Indicator } from 'flowbite-svelte'
	import type { IndicatorColorType } from 'flowbite-svelte/dist/types'

	let color: IndicatorColorType = 'yellow'

	const updateColor = () => {
		if ($tastytradeConnection == 'not connected') {
			color = 'red'
		} else if ($tastytradeConnection == 'connecting') {
			color = 'yellow'
		} else if ($tastytradeConnection == 'connected') {
			color = 'green'
		}
	}

	$: if ($tastytradeConnection) {
		updateColor()
	}
</script>

<div class="flex items-center gap-1">
	<Indicator {color} /> tastytrade
</div>
