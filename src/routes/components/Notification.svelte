<script lang="ts">
	import { notification, NotificationType, type NotificationMessage } from '$lib/notification'
	import { Toast } from 'flowbite-svelte'
	import { onDestroy } from 'svelte'

	const divClass = 'w-full max-w-xs p-4 dark:text-gray-500 dark:bg-white shadow text-gray-400 bg-gray-800 gap-3'

	let count = 0
	let toasts: NotificationMessage[] = []

	let unsubscribe = notification.subscribe((value) => {
		if (!value) {
			return
		}
		createToast(value.message, value.type, value.timeout)
		notification.set(undefined)
	})

	onDestroy(unsubscribe)

	const createToast = (message: string, type: NotificationType, timeout: number) => {
		let id = count
		toasts = [{ id, type, message, timeout }, ...toasts]
		count = count + 1

		setTimeout(() => {
			removeToast(id)
		}, timeout)
	}

	const removeToast = (id: number) => {
		toasts = toasts.filter((t) => t.id != id)
	}

	const typeToColor = (typ: NotificationType) => {
		switch (typ) {
			case NotificationType.info:
				return 'green'

			case NotificationType.error:
				return 'red'

			case NotificationType.warning:
				return 'yellow'

			default:
				return 'green'
		}
	}
</script>

<div class="fixed bottom-5 right-5">
	{#each toasts as toast (toast.id)}
		<Toast {divClass} color={typeToColor(toast.type)} class="z-30 w-96 mt-5" open>
			<svelte:fragment slot="icon">
				{#if toast.type == NotificationType.info}
					<svg aria-hidden="true" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
				{:else if toast.type == NotificationType.error}
					<svg aria-hidden="true" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
				{:else if toast.type == NotificationType.warning}
					<svg aria-hidden="true" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
				{/if}
			</svelte:fragment>
			<p class="mb-2">{toast.message}</p>
		</Toast>
	{/each}
</div>
