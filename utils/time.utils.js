class TimeUtils {
  static isTimeInRange(time, start, end) {
    const [timeHour, timeMinute] = time.split(':').map(Number);
    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);

    const timeValue = timeHour * 60 + timeMinute;
    const startValue = startHour * 60 + startMinute;
    const endValue = endHour * 60 + endMinute;

    return timeValue >= startValue && timeValue < endValue;
  }

  static addMinutes(time, minutes) {
    const [hours, mins] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, mins + minutes);
    return date.toTimeString().slice(0, 5);
  }

  static formatTime(date) {
    return date.toTimeString().slice(0, 5);
  }

  static parseTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0);
    return date;
  }

  static isOverlapping(start1, end1, start2, end2) {
    const [s1h, s1m] = start1.split(':').map(Number);
    const [e1h, e1m] = end1.split(':').map(Number);
    const [s2h, s2m] = start2.split(':').map(Number);
    const [e2h, e2m] = end2.split(':').map(Number);

    const start1Value = s1h * 60 + s1m;
    const end1Value = e1h * 60 + e1m;
    const start2Value = s2h * 60 + s2m;
    const end2Value = e2h * 60 + e2m;

    return !(end1Value <= start2Value || start1Value >= end2Value);
  }
}

module.exports = TimeUtils; 