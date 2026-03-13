function ifDateGetDateText(dateElement) {
  const spans = dateElement.querySelectorAll('span');
  if (spans.length !== 2) return null;
  const monthRaw = spans[0].textContent.trim().replace("/", '');
  const dayRaw = spans[1].textContent.trim();
  if (!/^\d{1,2}$/.test(monthRaw) || !/^\d{1,2}$/.test(dayRaw)) {
    return null;
  }

  const month = monthRaw.padStart(2, '0');
  const day = dayRaw.padStart(2, '0');
  return [month, day];
}

function isValidShift(startTime, endTime) {
  return isValidTime(startTime) && isValidTime(endTime);
}

function isValidTime(time) {
  const timePattern = /^(1?\d|2[0-3]):([0-5]\d)$/;
  return timePattern.test(time);
}

window.onload = function() {

  const headerNow = document.querySelector('.staffpage-plan-header-now');
  const headerText = headerNow ? headerNow.textContent : ''; // "2025/11/16(日)～..."
  const yearMatch = headerText.match(/^(\d{4})\//); // "2025/" にマッチ

  // 年が取得できなかった場合のフォールバック（万が一のため）
  let currentYear = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

  // background から保存済みシフト一覧を取得
  chrome.runtime.sendMessage({ action: "getStoredShifts" }, (storedShiftsMap) => {
    const storedShifts = storedShiftsMap || {};
    const shiftButtons = new Map();

    const shiftContainers = document.querySelectorAll('.pull-left');

    let previousMonth = -1;

    shiftContainers.forEach(container => {
      const dateElement = container.querySelector('.staffpage-plan-list-day button');
      const shiftElement = container.querySelector('.staffpage-plan-list-shift button');
      const shiftParent = container.querySelector('.staffpage-plan-list-shift');

      if (dateElement && shiftElement) {
        if (shiftParent) {
            shiftParent.style.marginBottom = '0px';
        }

        const dateResult = ifDateGetDateText(dateElement);
        if (!dateResult) return;

        const [monthText, dayText] = dateResult;
        const month = parseInt(monthText, 10);
        if (previousMonth === 12 && month === 1) {
            currentYear++;
        }
        previousMonth = month;

        const dateText = `${currentYear}-${monthText}-${dayText}`;
        const shiftDetails = shiftElement.querySelector('p').innerHTML.trim();
        const [startTime, endTime] = shiftDetails.split('<br>').map(time => time.replace(/&nbsp;|\u00A0/g, '').trim());

        const shiftKey = `${dateText}-${startTime}-${endTime}`;

        let isValid = isValidShift(startTime, endTime);
        const existingEventId = storedShifts[shiftKey];

        createShiftButton(
          container,
          { dateText, startTime, endTime, shiftKey, isValid, existingEventId },
          shiftButtons
        );
      }
    });

    addBulkAddButton(shiftButtons);
  });
};

function sendMessageAsync(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      if (response && response.success) {
        resolve(response);
      } else {
        reject(response ? response.error : "Unknown error");
      }
    });
  });
}

function createShiftButton(container, shiftData, shiftButtons) {
  const newDiv = document.createElement('div');
  newDiv.className = 'btn';
  newDiv.style.width = '100px';
  newDiv.style.marginBottom = '5px';
  newDiv.style.display = 'block';
  newDiv.style.padding = '5px 0';
  newDiv.style.color = 'white';
  newDiv.style.textAlign = 'center';
  newDiv.style.borderRadius = '4px';

  // シフトデータをボタンにアタッチ
  newDiv.dataset.date = shiftData.dateText;
  newDiv.dataset.start = shiftData.startTime;
  newDiv.dataset.end = shiftData.endTime;
  newDiv.dataset.key = shiftData.shiftKey;

  container.appendChild(newDiv);

  let attachedButton;

  // 状態管理関数を呼び出して初期状態を設定
  if (!shiftData.isValid) {
    attachedButton = updateButtonState(newDiv, 'invalid');
  } else if (shiftData.existingEventId) {
    attachedButton = updateButtonState(newDiv, 'delete', { eventId: shiftData.existingEventId, shiftButtons });
  } else {
    attachedButton = updateButtonState(newDiv, 'add', { shiftButtons });
  }
  return attachedButton;
}

function updateButtonState(buttonElement, state, context = {}) {
  // 既存のイベントリスナーを全削除（重複登録を防ぐため）
  const newButton = buttonElement.cloneNode(true);
  buttonElement.parentNode.replaceChild(newButton, buttonElement);
  buttonElement = newButton; // 参照を新しいボタンに切り替える

  const { eventId, shiftButtons } = context;
  const { key } = buttonElement.dataset;

  switch (state) {
    case 'add':
      buttonElement.textContent = chrome.i18n.getMessage('addToCalendarButtonText');
      buttonElement.style.backgroundColor = '#007bff';
      buttonElement.style.pointerEvents = 'auto';
      buttonElement.style.cursor = 'pointer';
      buttonElement.addEventListener('click', () => handleAddToCalendar(buttonElement, shiftButtons));
      if (shiftButtons) shiftButtons.set(key, buttonElement);
      break;

    case 'delete':
      buttonElement.textContent = chrome.i18n.getMessage('deleteFromCalendarButtonText');
      buttonElement.style.backgroundColor = '#dc3545';
      buttonElement.style.pointerEvents = 'auto';
      buttonElement.style.cursor = 'pointer';
      buttonElement.dataset.eventId = eventId;
      buttonElement.addEventListener('click', () => handleDeleteFromCalendar(buttonElement, shiftButtons));
      if (shiftButtons) shiftButtons.delete(key);
      break;
      
    case 'adding':
      buttonElement.textContent = chrome.i18n.getMessage('adding');
      buttonElement.style.backgroundColor = '#6c757d';
      buttonElement.style.pointerEvents = 'none';
      break;
      
    case 'deleting':
      buttonElement.textContent = chrome.i18n.getMessage('deleting');
      buttonElement.style.backgroundColor = '#6c757d';
      buttonElement.style.pointerEvents = 'none';
      break;

    case 'failed':
      buttonElement.textContent = chrome.i18n.getMessage('failed');
      buttonElement.style.backgroundColor = '#ffc107';
      buttonElement.style.pointerEvents = 'auto';
      buttonElement.style.cursor = 'pointer';
      buttonElement.addEventListener('click', () => handleAddToCalendar(buttonElement, shiftButtons));
      if (shiftButtons) shiftButtons.set(key, buttonElement);
      break;

    case 'invalid':
    default:
      buttonElement.textContent = chrome.i18n.getMessage('NoShiftButtonText');
      buttonElement.style.backgroundColor = '#6c757d';
      buttonElement.style.pointerEvents = 'none';
      break;
  }

  return buttonElement;
}

async function handleAddToCalendar(buttonElement, shiftButtons) {
  const { date, start, end, key } = buttonElement.dataset;
  const shift = { date, start, end };
  
  let currentButton = updateButtonState(buttonElement, 'adding');

  try {
    const response = await sendMessageAsync({ action: "addShiftsToCalendar", shift });
    updateButtonState(currentButton, 'delete', { eventId: response.data.id, shiftButtons });
  } catch (error) {
    console.error('Error creating event:', error);
    alert(chrome.i18n.getMessage('addShiftFailed'));
    updateButtonState(currentButton, 'failed', { shiftButtons });
  }
}

async function handleDeleteFromCalendar(buttonElement, shiftButtons) {
  const { eventId, key } = buttonElement.dataset;

  let currentButton = updateButtonState(buttonElement, 'deleting');

  try {
    await sendMessageAsync({ action: "deleteShiftFromCalendar", eventId, shiftKey: key });
    updateButtonState(currentButton, 'add', { shiftButtons });
  } catch (error) {
    console.error('Error deleting event:', error);
    alert(chrome.i18n.getMessage('deleteShiftFailed'));
    updateButtonState(currentButton, 'delete', { eventId, shiftButtons });
  }
}

function addBulkAddButton(shiftButtons) {
  const bulkAddDiv = document.createElement('div');
  bulkAddDiv.textContent = chrome.i18n.getMessage('bulkAddButtonText');
  bulkAddDiv.className = 'btn btn-success';
  bulkAddDiv.style.margin = '0 auto';
  bulkAddDiv.style.cursor = 'pointer';

  bulkAddDiv.style.margin = '10px auto';
  bulkAddDiv.style.cursor = 'pointer';
  bulkAddDiv.style.textAlign = 'center';
  bulkAddDiv.style.borderRadius = '4px';
  bulkAddDiv.style.width = '200px';
  bulkAddDiv.style.padding = '10px';
  bulkAddDiv.style.display = 'block';

  bulkAddDiv.addEventListener('click', async function() {
    const buttonsToProcess = Array.from(shiftButtons.values())

    const totalShifts = buttonsToProcess.length;
    if (totalShifts === 0) {
      bulkAddDiv.textContent = chrome.i18n.getMessage('allShiftsAdded');
      bulkAddDiv.style.pointerEvents = 'none';
      bulkAddDiv.style.backgroundColor = '#6c757d';
      return;
    }

    bulkAddDiv.style.pointerEvents = 'none';
    bulkAddDiv.style.backgroundColor = '#6c757d';

    let successCount = 0;

    for (let i = 0; i < buttonsToProcess.length; i++) {
      const buttonElement = buttonsToProcess[i];
      bulkAddDiv.textContent = `${chrome.i18n.getMessage('adding')} (${i + 1}/${totalShifts})`;

      const { date, start, end } = buttonElement.dataset;
      const shift = { date, start, end };

      try {
        const response = await sendMessageAsync({ action: "addShiftsToCalendar", shift });
        updateButtonState(buttonElement, 'delete', { eventId: response.data.id, shiftButtons });
        successCount++;
      } catch (error) {
        console.error('Bulk add failed for one shift:', error);
        updateButtonState(buttonElement, 'add', { shiftButtons });
      }
    }

    const resultMessage = chrome.i18n.getMessage('bulkAddResultFormat', [successCount, totalShifts]);
    bulkAddDiv.textContent = resultMessage;

    if (successCount === totalShifts) {
      bulkAddDiv.textContent = chrome.i18n.getMessage('allShiftsAdded');
    } else {
      const resultMessage = chrome.i18n.getMessage('bulkAddResultFormat', [successCount, totalShifts]);
      bulkAddDiv.textContent = resultMessage;
      bulkAddDiv.style.pointerEvents = 'auto';
      bulkAddDiv.style.backgroundColor = '#28a745';
    }
  });

  const header = document.querySelector('.staffpage-plan-header');
  if (header) {
    header.parentNode.insertBefore(bulkAddDiv, header.nextSibling);
  }
}