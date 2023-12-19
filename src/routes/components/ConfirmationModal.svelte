<script lang="ts">
	import { confirmationMessage, type ConfirmationMessage } from '$lib/interface'
	import { Button, Modal } from 'flowbite-svelte'
	import { onDestroy, tick } from 'svelte'

	let open = false
	let messageData: ConfirmationMessage

	let unsubscribe = confirmationMessage.subscribe(async (value) => {
		if (!value) {
			return
		}

		messageData = value
		confirmationMessage.set(null)
		open = true

		await tick()
		let el = document.getElementById('confirmCloseButton')
		if (el) {
			el.focus()
		}
	})

	const onConfirmation = () => {
		open = false
		messageData.func()
	}

	const onCancel = () => {
		open = false
	}

	onDestroy(unsubscribe)
</script>

<Modal bind:open size="xs" autoclose>
	<div class="text-center">
		<svg aria-hidden="true" class="mx-auto mb-4 w-14 h-14 text-gray-400 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
		<h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">{messageData.message}</h3>
		<Button type="button" color="alternative" on:click={onCancel}>No, cancel</Button>
		<Button id="confirmCloseButton" color="red" class="mr-2" on:click={onConfirmation}>Yes, confirm</Button>
	</div>
</Modal>
