<script lang="ts">
	import { Modal, Spinner } from 'flowbite-svelte'
	import { tastytradeSession } from '$lib/tastytrade'
</script>

<Modal open={$tastytradeSession == 'checking'} size="xs" permanent>
	<div class="text-center">
		<Spinner color="blue" size="12" />
		<p class="text-center mt-4 text-black font-semibold text-xl">Connecting...</p>
	</div>
</Modal>
