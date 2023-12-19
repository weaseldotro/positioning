import { writable } from 'svelte/store'

export interface ConfirmationMessage {
	message: string
	func: () => void
	danger: boolean
}

export const confirmationMessage = writable<ConfirmationMessage | null>(null)

export const showConfirmation = (message: string, func: () => void, danger = false) => {
	confirmationMessage.set({ message, func, danger })
}

export const loadingData = writable<boolean>(false)

export const leftDrawerHidden = writable<boolean>(true)
