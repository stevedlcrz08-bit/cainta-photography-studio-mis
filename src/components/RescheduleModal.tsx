import React, { useState, useEffect } from "react";
import { X, Calendar, Clock, AlertTriangle, Check, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { apiRequest, ApiError } from "../utils/apiClient.ts";

interface RescheduleModalProps {
  booking: any;
  studio: any;
  services: any[];
  packages: any[];
  currentUser: any;
  onClose: () => void;
  onSuccess: (updatedBooking: any) => void;
}

// Time slots spanning typical studio hours
const TIME_SLOTS = [
  "08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM",
  "04:00 PM", "05:00 PM", "06:00 PM"
];

function parseTimeToMinutes(timeStr: string): number {
  const clean = timeStr.trim().toUpperCase();
  const isPM = clean.includes("PM");
  const isAM = clean.includes("AM");
  const numbers = clean.replace(/[^0-9:]/g, "");
  const parts = numbers.split(":");
  let hours = parseInt(parts[0], 10) || 9;
  const minutes = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export default function RescheduleModal({
  booking,
  studio,
  services,
  packages,
  currentUser,
  onClose,
  onSuccess,
}: RescheduleModalProps) {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Calendar state
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Existing bookings for conflict detection
  const [existingBookings, setExistingBookings] = useState<any[]>([]);

  useEffect(() => {
    if (studio?.id) {
      apiRequest(`/api/bookings?studioId=${studio.id}`)
        .then(data => { if (data.bookings) setExistingBookings(data.bookings); })
        .catch(() => {});
    }
  }, [studio?.id]);

  // Determine shoot duration from booking
  const getShootDuration = () => {
    if (booking.packageId) {
      const pkg = packages.find((p: any) => p.id === booking.packageId);
      if (pkg?.durationMinutes) return pkg.durationMinutes;
    }
    if (booking.serviceId) {
      const svc = services.find((s: any) => s.id === booking.serviceId);
      if (svc?.durationMinutes) return svc.durationMinutes;
    }
    return 60;
  };

  const shootDuration = getShootDuration();

  const isSlotConflict = (date: string, slot: string) => {
    if (!date) return false;
    const newStart = parseTimeToMinutes(slot);
    const newEnd = newStart + shootDuration;
    return existingBookings.some((b: any) => {
      if (b.id === booking.id) return false;
      if (b.bookingDate !== date) return false;
      if (["Cancelled", "Rejected", "Expired"].includes(b.status)) return false;
      let existingDuration = 60;
      if (b.packageId) {
        const p = packages.find((pkg: any) => pkg.id === b.packageId);
        if (p?.durationMinutes) existingDuration = p.durationMinutes;
      } else if (b.serviceId) {
        const s = services.find((svc: any) => svc.id === b.serviceId);
        if (s?.durationMinutes) existingDuration = s.durationMinutes;
      }
      const existingStart = parseTimeToMinutes(b.timeSlot);
      const existingEnd = existingStart + existingDuration;
      return newStart < existingEnd && newEnd > existingStart;
    });
  };

  // Calendar helpers
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  const handlePrevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };

  const handleNextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  const isPastDate = (year: number, month: number, day: number) => {
    const d = new Date(year, month, day);
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return d < t;
  };

  const selectDate = (day: number) => {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(dateStr);
    setSelectedSlot("");
    setError("");
  };

  const handleReschedule = async () => {
    if (!selectedDate) { setError("Please select a new date."); return; }
    if (!selectedSlot) { setError("Please select a new time slot."); return; }

    setLoading(true);
    setError("");
    try {
      const data = await apiRequest(`/api/bookings/${booking.id}/reschedule`, {
        method: "PUT",
        body: {
          newDate: selectedDate,
          newTimeSlot: selectedSlot,
          reason: reason.trim() || "Customer requested reschedule"
        }
      });
      if (data.success) {
        setSuccess(`Booking rescheduled to ${selectedDate} at ${selectedSlot}!`);
        setTimeout(() => {
          onSuccess(data.booking);
          onClose();
        }, 1400);
      }
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : "Failed to reschedule. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const totalDays = daysInMonth(calYear, calMonth);
  const startDay = firstDayOfMonth(calYear, calMonth);
  const calCells: (number | null)[] = [
    ...Array(startDay).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1)
  ];
  // Pad to complete last row
  while (calCells.length % 7 !== 0) calCells.push(null);

  const serviceName = services.find((s: any) => s.id === booking.serviceId)?.name || "Session";
  const packageName = packages.find((p: any) => p.id === booking.packageId)?.name;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto border border-[#e5e1da]"
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 20 }}
          transition={{ duration: 0.25 }}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-5 border-b border-[#e5e1da] rounded-t-3xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                <RefreshCw size={18} className="text-amber-700" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-[#2c2a29]">Reschedule Booking</h2>
                <p className="text-xs text-[#7c756d]">
                  {booking.id} · {packageName || serviceName} · Currently {booking.bookingDate} at {booking.timeSlot}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Current booking info */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
              <p className="font-bold mb-1">📅 Current Schedule</p>
              <p>{booking.bookingDate} at {booking.timeSlot}</p>
              {(booking.previousDate) && (
                <p className="text-xs mt-1 text-amber-600">
                  Previously rescheduled from {booking.previousDate} at {booking.previousTimeSlot}
                </p>
              )}
            </div>

            {/* Calendar */}
            <div>
              <h3 className="text-sm font-bold text-[#2c2a29] mb-3 flex items-center gap-2">
                <Calendar size={15} className="text-amber-600" /> Select New Date
              </h3>
              <div className="border border-[#e5e1da] rounded-2xl overflow-hidden">
                {/* Month nav */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#faf9f6] border-b border-[#e5e1da]">
                  <button
                    onClick={handlePrevMonth}
                    className="p-1.5 rounded-lg hover:bg-[#e5e1da] transition-colors cursor-pointer"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="font-bold text-sm text-[#2c2a29]">
                    {monthNames[calMonth]} {calYear}
                  </span>
                  <button
                    onClick={handleNextMonth}
                    className="p-1.5 rounded-lg hover:bg-[#e5e1da] transition-colors cursor-pointer"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 bg-[#faf9f6] border-b border-[#e5e1da]">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                    <div key={d} className="text-center py-2 text-[10px] font-bold text-[#7c756d] uppercase tracking-wider">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 p-2 gap-1">
                  {calCells.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const past = isPastDate(calYear, calMonth, day);
                    const isSame = dateStr === booking.bookingDate;
                    const isSelected = dateStr === selectedDate;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={past || isSame}
                        onClick={() => selectDate(day)}
                        className={`
                          aspect-square flex items-center justify-center text-xs font-semibold rounded-xl transition-all cursor-pointer
                          ${past || isSame ? "opacity-30 cursor-not-allowed text-gray-400" : "hover:bg-amber-50"}
                          ${isSelected ? "bg-amber-600 text-white shadow-md scale-105" : ""}
                          ${isSame ? "ring-1 ring-amber-300" : ""}
                        `}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Time slots */}
            {selectedDate && (
              <div>
                <h3 className="text-sm font-bold text-[#2c2a29] mb-3 flex items-center gap-2">
                  <Clock size={15} className="text-amber-600" /> Select New Time Slot
                  <span className="text-[10px] text-[#7c756d] font-normal ml-1">({shootDuration} min session)</span>
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {TIME_SLOTS.map(slot => {
                    const conflict = isSlotConflict(selectedDate, slot);
                    const isCurrent = slot === booking.timeSlot && selectedDate === booking.bookingDate;
                    const isSelected = slot === selectedSlot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={conflict || isCurrent}
                        onClick={() => { setSelectedSlot(slot); setError(""); }}
                        className={`
                          py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center
                          ${conflict || isCurrent ? "opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400" : "hover:border-amber-400 hover:bg-amber-50"}
                          ${isSelected ? "bg-amber-600 text-white border-amber-600 shadow-md" : "bg-white border-[#e5e1da] text-[#2c2a29]"}
                        `}
                        title={conflict ? "Time slot already booked" : isCurrent ? "Current time slot" : ""}
                      >
                        {slot}
                        {conflict && <span className="block text-[9px] font-normal opacity-70">Booked</span>}
                        {isCurrent && <span className="block text-[9px] font-normal opacity-70">Current</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-sm font-bold text-[#2c2a29] mb-2">
                Reason for Rescheduling <span className="text-[#7c756d] font-normal">(optional)</span>
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Schedule conflict, weather concerns…"
                rows={2}
                maxLength={300}
                className="w-full border border-[#e5e1da] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none text-[#2c2a29] placeholder-gray-400"
              />
            </div>

            {/* Summary */}
            {selectedDate && selectedSlot && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-800">
                <p className="font-bold mb-1 flex items-center gap-1.5">
                  <Check size={14} /> New Schedule Summary
                </p>
                <p><strong>Date:</strong> {selectedDate}</p>
                <p><strong>Time:</strong> {selectedSlot}</p>
                <p className="text-xs mt-1 text-emerald-600">
                  Both you and the studio will be notified about this reschedule.
                </p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl px-4 py-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl px-4 py-3">
                <Check size={16} className="mt-0.5 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-white border border-[#e5e1da] text-[#2c2a29] text-sm font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReschedule}
                disabled={loading || !selectedDate || !selectedSlot || !!success}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Rescheduling…
                  </>
                ) : (
                  <>
                    <Calendar size={14} /> Confirm Reschedule
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
