<script>
	import '../app.postcss'
	import { loadingData } from '$lib/interface'
	import ConfirmationModal from './components/ConfirmationModal.svelte'
	import Notification from './components/Notification.svelte'
</script>

<slot />

{#if $loadingData}
	<div id="loading-screen" class="fixed top-0 left-0 right-0 bottom-0 w-full h-screen z-50 overflow-hidden bg-white opacity-50 dark:opacity-20 flex flex-col items-center justify-center cursor-wait" />
{/if}

<ConfirmationModal />
<Notification />
