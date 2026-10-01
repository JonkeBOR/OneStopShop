export const fitnessTrackerStrings = {
  formHeading: 'Add a measurement',
  weightLabel: 'Weight (kg)',
  dateLabel: 'Date',
  submitAction: 'Save',
  historyHeading: 'History',
  emptyHistory: 'No measurements yet.',
  weightUnit: 'kg',
  errors: {
    invalidMeasurement: 'One or more fields need attention.',
    weightRequired: 'Enter your weight.',
    weightRange: 'Weight must be between 20 and 400 kg.',
    weightPrecision: 'Weight can have at most one decimal place.',
    dateInvalid: 'Enter a valid date.',
    dateInFuture: 'Date cannot be in the future.',
    storeUnavailable: 'Could not save right now. Please try again.',
    storeMisconfigured: 'The store is not set up correctly.',
  },
} as const;
