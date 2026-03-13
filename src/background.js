chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "addShiftsToCalendar") {
    (async () => {
      try {
        const shift = request.shift;
        const token = await getGoogleAuthToken();
        const config = await chrome.storage.sync.get(['calendarTitle', 'calendarColor']);

        const calendarTitle = config.calendarTitle || "RShift予定日";
        const calendarColor = config.calendarColor || 1;

        const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            summary: calendarTitle,
            start: {
              dateTime: `${formatDateTime(shift.date, shift.start)}`,
              timeZone: 'Asia/Tokyo'
            },
            end: {
              dateTime: `${formatDateTime(shift.date, shift.end)}`,
              timeZone: 'Asia/Tokyo'
            },
            colorId: calendarColor
          })
        });

        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${await response.text()}`);
        }

        const eventData = await response.json();

        const shiftKey = `${shift.date}-${shift.start}-${shift.end}`;
        const { storedShifts } = await storage.get("storedShifts");
        const newStoredShifts = storedShifts || {};
        newStoredShifts[shiftKey] = eventData.id;
        await storage.set({ storedShifts: newStoredShifts });

        sendResponse({ success: true, data: eventData });

      } catch (error) {
        console.error("Error in addShiftsToCalendar:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  if (request.action === "deleteShiftFromCalendar") {
    (async () => {
      try {
        const { eventId, shiftKey } = request;
        if (!eventId || !shiftKey) {
          throw new Error("eventId or shiftKey is missing");
        }

        const token = await getGoogleAuthToken();

        const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (!response.ok && response.status !== 404 && response.status !== 410) {
          throw new Error(`API Error: ${response.status} ${await response.text()}`);
        }

        const { storedShifts } = await storage.get("storedShifts");
        if (storedShifts && storedShifts[shiftKey]) {
          delete storedShifts[shiftKey];
          await storage.set({ storedShifts: storedShifts });
        }

        sendResponse({ success: true });

      } catch (error) {
        console.error("Error in deleteShiftFromCalendar:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true;
  }

  if (request.action === "getStoredShifts") {
    (async () => {
      const { storedShifts } = await storage.get("storedShifts");
      sendResponse(storedShifts || {});
    })();
    
    return true;
  }
});

function formatDateTime(dateText, time) {
  if (!dateText || !time) {
    throw new Error(`Missing date or time. Date: ${dateText}, Time: ${time}`);
  }

  const dateParts = dateText.split(/[-/]/);
  const timeParts = time.split(':');

  if (dateParts.length !== 3 || timeParts.length < 2) {
    throw new Error(`Invalid format. Date: ${dateText}, Time: ${time}`);
  }
  const [year, month, day] = dateParts.map(s => s.padStart(2, '0'));
  const [hour, minute] = timeParts.map(s => s.padStart(2, '0'));

  return `${year}-${month}-${day}T${hour}:${minute}:00`;
}

async function getGoogleAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

const storage = {
  get: (keys) => new Promise((resolve) => chrome.storage.local.get(keys, (result) => resolve(result))),
  set: (items) => new Promise((resolve) => chrome.storage.local.set(items, () => resolve())),
};