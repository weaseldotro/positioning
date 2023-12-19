<script lang="ts">
	import { dxfeedConnection } from '$lib/dxfeed'
	import { Indicator } from 'flowbite-svelte'
	import type { IndicatorColorType } from 'flowbite-svelte/dist/types'

	let color: IndicatorColorType = 'yellow'

	const updateColor = () => {
		if ($dxfeedConnection == 'not connected') {
			color = 'red'
		} else if ($dxfeedConnection == 'connecting') {
			color = 'yellow'
		} else if ($dxfeedConnection == 'connected') {
			color = 'green'
		}
	}

	$: if ($dxfeedConnection) {
		updateColor()
	}
</script>

<div class="flex items-center gap-1">
	<Indicator {color} /> dxfeed
</div>
