import React, { useState } from "react";
import { 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, 
  User as UserIcon, CheckCircle, AlertCircle, Eye, Download, Sparkles, Filter, X,
  Grid, List
} from "lucide-react";
import { Booking, Studio } from "../db/types";
import { generateBookingReceiptPDF } from "../utils/pdfGenerator";
import { getGoogleCalendarUrl, downloadIcsFile } from "../utils/calendarSync";

interface SystemCalendarProps {
  bookings: Booking[];
  studio?: Studio;
  userRole?: "STUDIO_ADMIN" | "CUSTOMER" | "SUPER_ADMIN";
  onSelectBooking?: (booking: Booking) => void;
  onOpenProofing?: (bookingId: string) => void;
  onRequestBookingDate?: (dateStr: string) => void;
}

export const SystemCalendar: React.FC<SystemCalendarProps> = ({
  bookings,
  studio,
  userRole = "STUDIO_ADMIN",
  onSelectBooking,
  onOpenProofing,
  onRequestBookingDate
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date(2026, 7, 1)); // Default August 2026
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [mobileView, setMobileView] = useState<"grid" | "agenda">("grid");

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Days in month calculation
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date(2026, 7, 13));
  };

  // Filter bookings for current active status filter
  const filteredBookings = bookings.filter(b => {
    if (statusFilter === "ALL") return true;
    return b.status.toUpperCase() === statusFilter.toUpperCase();
  });

  // Map bookings by date string (YYYY-MM-DD)
  const bookingsByDate: { [dateStr: string]: Booking[] } = {};
  filteredBookings.forEach(b => {
    if (!bookingsByDate[b.bookingDate]) {
      bookingsByDate[b.bookingDate] = [];
    }
    bookingsByDate[b.bookingDate].push(b);
  });

  // Generate calendar day cells
  const calendarDays = [];
  // Empty padding cells for previous month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const monthStr = String(month + 1).padStart(2, "0");
    const dayStr = String(d).padStart(2, "0");
    const dateStr = `${year}-${monthStr}-${dayStr}`;
    calendarDays.push({
      dayNumber: d,
      dateStr,
      dayBookings: bookingsByDate[dateStr] || []
    });
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "confirmed":
      case "approved":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "pending":
        return "bg-amber-100 text-amber-800 border-amber-300";
      case "completed":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "cancelled":
      case "rejected":
        return "bg-rose-100 text-rose-800 border-rose-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#e5e1da] p-3 sm:p-5 shadow-sm space-y-4 text-left">
      {/* Calendar Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5e1da] pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 inline-flex items-center gap-1 mb-1">
            <Sparkles size={12} /> Cainta Studio Built-in Calendar
          </span>
          <h3 className="font-display text-xl font-extrabold text-[#2c2a29]">
            {monthNames[month]} {year} Schedule
          </h3>
          <p className="text-xs text-[#7c756d]">
            Interactive system calendar for photoshoot appointments & studio availability
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mobile View Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl sm:hidden">
            <button
              onClick={() => setMobileView("grid")}
              className={`p-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                mobileView === "grid" ? "bg-[#2c2a29] text-white" : "text-gray-600"
              }`}
              title="Month Grid"
            >
              <Grid size={15} />
            </button>
            <button
              onClick={() => setMobileView("agenda")}
              className={`p-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                mobileView === "agenda" ? "bg-[#2c2a29] text-white" : "text-gray-600"
              }`}
              title="Agenda List"
            >
              <List size={15} />
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-[#faf9f6] p-1 rounded-xl border border-[#e5e1da] text-xs overflow-x-auto max-w-full">
            <Filter size={12} className="text-gray-400 ml-1.5 shrink-0" />
            {["ALL", "CONFIRMED", "PENDING", "COMPLETED"].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2 py-1 rounded-lg font-bold text-[10px] sm:text-[11px] transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === st
                    ? "bg-[#2c2a29] text-white shadow-xs"
                    : "text-[#7c756d] hover:text-[#2c2a29]"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Month Navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleToday}
              className="px-2.5 py-1.5 bg-[#faf9f6] hover:bg-gray-100 text-[#2c2a29] border border-[#e5e1da] rounded-xl text-xs font-bold cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={handlePrevMonth}
              className="p-1.5 bg-[#faf9f6] hover:bg-gray-100 text-[#2c2a29] border border-[#e5e1da] rounded-xl cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 bg-[#faf9f6] hover:bg-gray-100 text-[#2c2a29] border border-[#e5e1da] rounded-xl cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* AGENDA LIST VIEW (FOR MOBILE OR TOGGLED) */}
      {mobileView === "agenda" && (
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            Agenda for {monthNames[month]} {year}
          </h4>
          {filteredBookings.length === 0 ? (
            <div className="p-8 text-center bg-[#faf9f6] rounded-2xl border border-dashed border-gray-200">
              <CalendarIcon size={28} className="mx-auto text-gray-400 mb-2" />
              <p className="text-xs text-gray-500 font-semibold">No bookings found for selected filter.</p>
            </div>
          ) : (
            filteredBookings.map(b => (
              <div
                key={b.id}
                onClick={() => {
                  setSelectedBooking(b);
                  if (onSelectBooking) onSelectBooking(b);
                }}
                className="p-3 bg-white border border-[#e5e1da] rounded-2xl flex items-center justify-between shadow-xs hover:border-gray-400 cursor-pointer"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-[#2c2a29]">{b.bookingDate}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${getStatusColor(b.status)}`}>
                      {b.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 font-bold">{b.customerDetails?.fullName || `Booking #${b.id}`}</p>
                  <p className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Clock size={11} /> {b.timeSlot}
                  </p>
                </div>
                <button className="px-3 py-1.5 bg-[#2c2a29] text-white text-xs font-bold rounded-xl shrink-0">
                  View
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* MONTH GRID VIEW */}
      {mobileView === "grid" && (
        <>
          {/* Weekday Labels Header */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
              <div key={day} className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#7c756d] py-1 bg-[#faf9f6] rounded-lg border border-gray-100">
                {day}
              </div>
            ))}
          </div>

          {/* Month Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((cell, idx) => {
              if (!cell) {
                return (
                  <div key={`empty-${idx}`} className="min-h-[45px] sm:min-h-[70px] bg-[#faf9f6]/40 rounded-xl border border-dashed border-gray-100" />
                );
              }

              const isToday = cell.dateStr === "2026-08-13";
              const isSelected = selectedDateStr === cell.dateStr;
              const hasBookings = cell.dayBookings.length > 0;

              return (
                <div
                  key={cell.dateStr}
                  onClick={() => setSelectedDateStr(cell.dateStr)}
                  className={`min-h-[50px] sm:min-h-[75px] p-1 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-amber-50/50 border-amber-400 ring-2 ring-amber-400/20 shadow-sm"
                      : isToday
                      ? "bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-300"
                      : "bg-white border-[#e5e1da] hover:border-gray-400 hover:shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center ${
                      isToday 
                        ? "bg-emerald-600 text-white" 
                        : isSelected 
                        ? "bg-amber-500 text-white" 
                        : "text-[#2c2a29]"
                    }`}>
                      {cell.dayNumber}
                    </span>

                    {hasBookings && (
                      <span className="text-[8px] font-bold text-amber-700 bg-amber-100 px-1 py-0.2 rounded-full border border-amber-200">
                        {cell.dayBookings.length}
                      </span>
                    )}
                  </div>

                  {/* Day's Bookings List Badges */}
                  <div className="space-y-0.5 my-0.5 overflow-y-auto max-h-[30px] sm:max-h-[40px]">
                    {cell.dayBookings.map(b => (
                      <div
                        key={b.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBooking(b);
                          if (onSelectBooking) onSelectBooking(b);
                        }}
                        className={`p-0.5 rounded-md border text-[8px] font-semibold truncate hover:scale-[1.02] transition-transform ${getStatusColor(b.status)}`}
                      >
                        <div className="flex items-center gap-0.5">
                          <span className="truncate">{b.timeSlot}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {cell.dayBookings.length === 0 && (
                    <span className="text-[8px] text-gray-300 italic text-center hidden sm:block mt-auto">Free</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Selected Date Summary Banner */}
      {selectedDateStr && (
        <div className="p-4 bg-[#faf9f6] border border-[#e5e1da] rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-[#2c2a29]">
              Schedule for {selectedDateStr}
            </h4>
            <p className="text-[11px] text-[#7c756d]">
              {bookingsByDate[selectedDateStr]?.length || 0} photoshoot appointments scheduled on this date.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onRequestBookingDate && (
              <button
                onClick={() => onRequestBookingDate(selectedDateStr)}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Sparkles size={13} /> Request Booking on this Date
              </button>
            )}
            <button
              onClick={() => setSelectedDateStr(null)}
              className="text-[11px] font-bold text-gray-500 hover:text-black px-3 py-1.5 rounded-lg border border-gray-200"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Booking Details Modal when clicked on Calendar Slot */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 text-left relative shadow-2xl border border-[#e5e1da] space-y-4">
            <button
              onClick={() => setSelectedBooking(null)}
              className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 text-[#2c2a29] rounded-full cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-gray-100 pb-3">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border uppercase tracking-wider ${getStatusColor(selectedBooking.status)}`}>
                {selectedBooking.status}
              </span>
              <h3 className="font-display font-extrabold text-base sm:text-lg text-[#2c2a29] mt-2">
                Booking Reference #{selectedBooking.id}
              </h3>
              <p className="text-xs text-gray-500">
                Studio Shoot Appointment Details
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#faf9f6] p-3 sm:p-4 rounded-2xl border border-[#e5e1da]">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Customer</span>
                <span className="font-bold text-[#2c2a29]">{selectedBooking.customerDetails?.fullName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Contact</span>
                <span className="font-semibold text-[#2c2a29]">{selectedBooking.customerDetails?.phone || "N/A"}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Date & Time</span>
                <span className="font-bold text-[#2c2a29]">{selectedBooking.bookingDate} ({selectedBooking.timeSlot})</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Payment Status</span>
                <span className="font-bold text-emerald-700">{selectedBooking.paymentStatus} (₱{selectedBooking.amountPaid || 0})</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={() => generateBookingReceiptPDF(selectedBooking, studio)}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Download size={13} /> PDF Receipt
              </button>

              <a
                href={getGoogleCalendarUrl({
                  title: `Photoshoot @ ${studio?.name || 'Cainta Studio'}`,
                  description: `Booking #${selectedBooking.id}`,
                  location: studio?.address || 'Cainta, Rizal',
                  startDate: selectedBooking.bookingDate,
                  timeSlot: selectedBooking.timeSlot
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs rounded-xl flex items-center gap-1"
              >
                <CalendarIcon size={13} /> Google Cal
              </a>

              {onOpenProofing && (
                <button
                  onClick={() => {
                    const id = selectedBooking.id;
                    setSelectedBooking(null);
                    onOpenProofing(id);
                  }}
                  className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 border border-amber-500/30 font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  Photo Proofs
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
